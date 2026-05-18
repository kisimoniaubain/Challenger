import jwt from 'jsonwebtoken'
import { EventEmitter } from 'node:events'
import {
  createGraphMessage,
  createGraphPost,
  createGraphStory,
  deleteGraphMessage,
  deleteGraphPost,
  deleteGraphStory,
  findGraphMessageById,
  findGraphPostById,
  findGraphStoryById,
  findGraphUserById,
  findGraphUserProfileById,
  getGraphDatabaseMode,
  listConnectionsByUser,
  listGraphMessages,
  listGraphPosts,
  listGraphUsers,
  updateGraphMessage,
  updateGraphPost,
  updateGraphStory,
} from './graphDb.js'

const SESSION_COOKIE_NAME = 'challenger_session'
const SESSION_SECRET = process.env.SESSION_SECRET || process.env.JWT_SECRET || 'challenger-dev-session-secret'
const GRAPHQL_EVENT_FEED_UPDATED = 'feed.updated'
const GRAPHQL_EVENT_MESSAGE_RECEIVED = 'message.received'
const eventBus = new EventEmitter()

eventBus.setMaxListeners(0)

function parseCookieHeader(cookieHeader) {
  if (!cookieHeader || typeof cookieHeader !== 'string') {
    return {}
  }

  return cookieHeader
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((accumulator, part) => {
      const separator = part.indexOf('=')
      if (separator <= 0) {
        return accumulator
      }

      const key = part.slice(0, separator).trim()
      const value = decodeURIComponent(part.slice(separator + 1).trim())
      accumulator[key] = value
      return accumulator
    }, {})
}

function mapUser(userRow) {
  if (!userRow) {
    return null
  }

  return {
    id: userRow.id,
    username: userRow.username || '',
    email: userRow.email || '',
    displayName: userRow.display_name || userRow.username || userRow.email || '',
    avatarUrl: userRow.avatar_url || '',
    coverPhotoUrl: userRow.cover_photo_url || '',
    gender: userRow.gender || '',
  }
}

function mapFeedPost(postRow) {
  return {
    id: postRow.id,
    body: postRow.body || '',
    mediaUrl: postRow.media_url || '',
    mediaType: postRow.media_type || '',
    visibility: postRow.visibility || 'public',
    likeCount: Number(postRow.like_count || 0),
    commentCount: Number(postRow.comment_count || 0),
    shareCount: Number(postRow.share_count || 0),
    createdAt: postRow.created_at || null,
    author: mapUser({
      id: postRow.author_id,
      username: postRow.author_username,
      email: '',
      display_name: postRow.author_display_name,
      avatar_url: postRow.author_avatar_url,
      cover_photo_url: '',
      gender: '',
    }),
  }
}

function mapStory(storyRow) {
  return {
    id: storyRow.id,
    body: storyRow.body || '',
    mediaUrl: storyRow.media_url || '',
    mediaType: storyRow.media_type || '',
    musicUrl: storyRow.music_url || '',
    musicName: storyRow.music_name || '',
    challengeTitle: storyRow.challenge_title || '',
    createdAt: storyRow.created_at || null,
    expiresAt: storyRow.expires_at || null,
    author: mapUser({
      id: storyRow.author_id,
      username: storyRow.author_username,
      email: '',
      display_name: storyRow.author_display_name,
      avatar_url: storyRow.author_avatar_url,
      cover_photo_url: '',
      gender: '',
    }),
  }
}

function mapMessage(messageRow) {
  return {
    id: messageRow.id,
    body: messageRow.body || '',
    replyMessageId: messageRow.reply_message_id || null,
    forwardedFromMessageId: messageRow.forwarded_from_message_id || null,
    createdAt: messageRow.created_at || null,
    editedAt: messageRow.edited_at || null,
    fromUser: mapUser({
      id: messageRow.from_user_id,
      username: messageRow.from_username,
      email: '',
      display_name: messageRow.from_username,
      avatar_url: '',
      cover_photo_url: '',
      gender: '',
    }),
    toUser: mapUser({
      id: messageRow.to_user_id,
      username: messageRow.to_username,
      email: '',
      display_name: messageRow.to_username,
      avatar_url: '',
      cover_photo_url: '',
      gender: '',
    }),
  }
}

function readSessionUserId(request) {
  const requestCookies = request?.cookies && typeof request.cookies === 'object'
    ? request.cookies
    : parseCookieHeader(request?.headers?.cookie)
  const token = requestCookies?.[SESSION_COOKIE_NAME]

  if (!token) {
    return null
  }

  try {
    const decoded = jwt.verify(token, SESSION_SECRET)
    return decoded?.sub || null
  } catch {
    return null
  }
}

function requireSessionUserId(context) {
  const userId = readSessionUserId(context?.request)
  if (!userId) {
    throw new Error('Authentication required.')
  }

  return userId
}

async function withGraphEnabled(fallbackValue, callback) {
  if (getGraphDatabaseMode() !== 'postgres') {
    return fallbackValue
  }

  try {
    return await callback()
  } catch {
    return fallbackValue
  }
}

function createTopicIterator(topic, filterFn = () => true) {
  const pullQueue = []
  const pushQueue = []
  let active = true

  const pushValue = (payload) => {
    if (!active || !filterFn(payload)) {
      return
    }

    if (pullQueue.length > 0) {
      const resolve = pullQueue.shift()
      resolve({ value: payload, done: false })
      return
    }

    pushQueue.push(payload)
  }

  const eventListener = (payload) => {
    pushValue(payload)
  }

  eventBus.on(topic, eventListener)

  return {
    next() {
      if (!active) {
        return Promise.resolve({ value: undefined, done: true })
      }

      if (pushQueue.length > 0) {
        return Promise.resolve({ value: pushQueue.shift(), done: false })
      }

      return new Promise((resolve) => {
        pullQueue.push(resolve)
      })
    },
    return() {
      active = false
      eventBus.off(topic, eventListener)
      while (pullQueue.length > 0) {
        const resolve = pullQueue.shift()
        resolve({ value: undefined, done: true })
      }
      return Promise.resolve({ value: undefined, done: true })
    },
    throw(error) {
      active = false
      eventBus.off(topic, eventListener)
      return Promise.reject(error)
    },
    [Symbol.asyncIterator]() {
      return this
    },
  }
}

export const schemaSource = `
  type User {
    id: ID!
    username: String!
    email: String!
    displayName: String!
    avatarUrl: String!
    coverPhotoUrl: String!
    gender: String!
    friends(limit: Int = 10): [User!]!
  }

  type FeedPost {
    id: ID!
    body: String!
    mediaUrl: String!
    mediaType: String!
    visibility: String!
    likeCount: Int!
    commentCount: Int!
    shareCount: Int!
    createdAt: String
    author: User!
  }

  type NavSummary {
    userCount: Int!
    feedCount: Int!
    unreadMessages: Int!
    unreadNotifications: Int!
  }

  type Story {
    id: ID!
    body: String!
    mediaUrl: String!
    mediaType: String!
    musicUrl: String!
    musicName: String!
    challengeTitle: String!
    createdAt: String
    expiresAt: String
    author: User!
  }

  type Message {
    id: ID!
    body: String!
    replyMessageId: ID
    forwardedFromMessageId: ID
    createdAt: String
    editedAt: String
    fromUser: User!
    toUser: User!
  }

  input CreatePostInput {
    body: String!
    mediaUrl: String
    mediaType: String
    visibility: String
  }

  input UpdatePostInput {
    body: String
    mediaUrl: String
    mediaType: String
    visibility: String
  }

  input CreateStoryInput {
    body: String!
    mediaUrl: String
    mediaType: String
    musicUrl: String
    musicName: String
    challengeTitle: String
    expiresAt: String
  }

  input UpdateStoryInput {
    body: String
    mediaUrl: String
    mediaType: String
    musicUrl: String
    musicName: String
    challengeTitle: String
  }

  input CreateMessageInput {
    toUserId: ID!
    body: String!
    replyMessageId: ID
    forwardedFromMessageId: ID
  }

  input UpdateMessageInput {
    body: String!
  }

  type Query {
    viewer: User
    user(id: ID!): User
    users(limit: Int = 12): [User!]!
    feed(limit: Int = 25): [FeedPost!]!
    navSummary(userId: ID!): NavSummary!
  }

  type Mutation {
    createPost(input: CreatePostInput!): FeedPost!
    updatePost(id: ID!, input: UpdatePostInput!): FeedPost!
    deletePost(id: ID!): Boolean!

    createStory(input: CreateStoryInput!): Story!
    updateStory(id: ID!, input: UpdateStoryInput!): Story!
    deleteStory(id: ID!): Boolean!

    createMessage(input: CreateMessageInput!): Message!
    updateMessage(id: ID!, input: UpdateMessageInput!): Message!
    deleteMessage(id: ID!): Boolean!
  }

  type Subscription {
    feedUpdated: FeedPost
    messageReceived(userId: ID!): Message
  }
`

export const resolvers = {
  Query: {
    viewer: async (_parent, _args, context) => withGraphEnabled(null, async () => {
      const request = context?.request
      const userId = readSessionUserId(request)
      if (!userId) {
        return null
      }

      const user = await findGraphUserProfileById(userId)
      return mapUser(user)
    }),

    user: async (_parent, { id }) => withGraphEnabled(null, async () => {
      const user = await findGraphUserProfileById(id)
      return mapUser(user)
    }),

    users: async (_parent, { limit = 12 }) => withGraphEnabled([], async () => {
      const users = await listGraphUsers({ limit })
      return users.map(mapUser)
    }),

    feed: async (_parent, { limit = 25 }) => withGraphEnabled([], async () => {
      const posts = await listGraphPosts({ limit })
      return posts.map(mapFeedPost)
    }),

    navSummary: async (_parent, { userId }) => withGraphEnabled({
      userCount: 0,
      feedCount: 0,
      unreadMessages: 0,
      unreadNotifications: 0,
    }, async () => {
      const [users, feed, messages] = await Promise.all([
        listGraphUsers({ limit: 12 }),
        listGraphPosts({ limit: 30 }),
        listGraphMessages({ userId, limit: 200 }),
      ])

      const unreadMessages = (messages || []).filter((item) => item.to_user_id === userId).length

      return {
        userCount: users.length,
        feedCount: feed.length,
        unreadMessages,
        unreadNotifications: 0,
      }
    }),
  },

  Mutation: {
    createPost: async (_parent, { input }, context) => withGraphEnabled(null, async () => {
      const userId = requireSessionUserId(context)
      const created = await createGraphPost({
        ...(input || {}),
        authorId: userId,
      })

      const hydrated = await findGraphPostById(created.id)
      const mapped = mapFeedPost(hydrated || created)
      eventBus.emit(GRAPHQL_EVENT_FEED_UPDATED, { feedUpdated: mapped })
      return mapped
    }),

    updatePost: async (_parent, { id, input }, context) => withGraphEnabled(null, async () => {
      const userId = requireSessionUserId(context)
      const existing = await findGraphPostById(id)
      if (!existing) {
        throw new Error('Post not found.')
      }

      if (existing.author_id !== userId) {
        throw new Error('Not allowed to update this post.')
      }

      await updateGraphPost(id, input || {})
      const hydrated = await findGraphPostById(id)
      if (!hydrated) {
        throw new Error('Post not found after update.')
      }

      const mapped = mapFeedPost(hydrated)
      eventBus.emit(GRAPHQL_EVENT_FEED_UPDATED, { feedUpdated: mapped })
      return mapped
    }),

    deletePost: async (_parent, { id }, context) => withGraphEnabled(false, async () => {
      const userId = requireSessionUserId(context)
      const existing = await findGraphPostById(id)
      if (!existing) {
        return false
      }

      if (existing.author_id !== userId) {
        throw new Error('Not allowed to delete this post.')
      }

      const deleted = await deleteGraphPost(id)
      if (deleted) {
        eventBus.emit(GRAPHQL_EVENT_FEED_UPDATED, { feedUpdated: null })
      }
      return Boolean(deleted)
    }),

    createStory: async (_parent, { input }, context) => withGraphEnabled(null, async () => {
      const userId = requireSessionUserId(context)
      const created = await createGraphStory({
        ...(input || {}),
        authorId: userId,
      })

      const hydrated = await findGraphStoryById(created.id)
      return mapStory(hydrated || created)
    }),

    updateStory: async (_parent, { id, input }, context) => withGraphEnabled(null, async () => {
      const userId = requireSessionUserId(context)
      const existing = await findGraphStoryById(id)
      if (!existing) {
        throw new Error('Story not found.')
      }

      if (existing.author_id !== userId) {
        throw new Error('Not allowed to update this story.')
      }

      await updateGraphStory(id, input || {})
      const hydrated = await findGraphStoryById(id)
      if (!hydrated) {
        throw new Error('Story not found after update.')
      }

      return mapStory(hydrated)
    }),

    deleteStory: async (_parent, { id }, context) => withGraphEnabled(false, async () => {
      const userId = requireSessionUserId(context)
      const existing = await findGraphStoryById(id)
      if (!existing) {
        return false
      }

      if (existing.author_id !== userId) {
        throw new Error('Not allowed to delete this story.')
      }

      const deleted = await deleteGraphStory(id)
      return Boolean(deleted)
    }),

    createMessage: async (_parent, { input }, context) => withGraphEnabled(null, async () => {
      const userId = requireSessionUserId(context)
      const created = await createGraphMessage({
        ...(input || {}),
        fromUserId: userId,
      })

      const hydrated = await findGraphMessageById(created.id)
      const mapped = mapMessage(hydrated || created)
      eventBus.emit(GRAPHQL_EVENT_MESSAGE_RECEIVED, { messageReceived: mapped })
      return mapped
    }),

    updateMessage: async (_parent, { id, input }, context) => withGraphEnabled(null, async () => {
      const userId = requireSessionUserId(context)
      const existing = await findGraphMessageById(id)
      if (!existing) {
        throw new Error('Message not found.')
      }

      if (existing.from_user_id !== userId) {
        throw new Error('Not allowed to update this message.')
      }

      await updateGraphMessage(id, input || {})
      const hydrated = await findGraphMessageById(id)
      if (!hydrated) {
        throw new Error('Message not found after update.')
      }

      return mapMessage(hydrated)
    }),

    deleteMessage: async (_parent, { id }, context) => withGraphEnabled(false, async () => {
      const userId = requireSessionUserId(context)
      const existing = await findGraphMessageById(id)
      if (!existing) {
        return false
      }

      if (existing.from_user_id !== userId) {
        throw new Error('Not allowed to delete this message.')
      }

      const deleted = await deleteGraphMessage(id)
      return Boolean(deleted)
    }),
  },

  Subscription: {
    feedUpdated: {
      subscribe: (_parent, _args, context) => {
        requireSessionUserId(context)
        return createTopicIterator(GRAPHQL_EVENT_FEED_UPDATED)
      },
      resolve: (payload) => payload?.feedUpdated || null,
    },

    messageReceived: {
      subscribe: (_parent, args, context) => {
        const userId = requireSessionUserId(context)
        if (String(args?.userId || '') !== String(userId)) {
          throw new Error('Not allowed to subscribe to another user messages.')
        }

        return createTopicIterator(
          GRAPHQL_EVENT_MESSAGE_RECEIVED,
          (payload) => String(payload?.messageReceived?.toUser?.id || '') === String(userId),
        )
      },
      resolve: (payload) => payload?.messageReceived || null,
    },
  },

  User: {
    friends: async (user, { limit = 10 }) => {
      const connections = await listConnectionsByUser(user.id, {
        relationType: 'friend',
        status: 'accepted',
        limit,
      })

      const friendIds = [...new Set(
        (connections || []).map((connection) => (
          connection.requester_id === user.id
            ? connection.addressee_id
            : connection.requester_id
        )).filter(Boolean),
      )]

      const resolved = await Promise.all(friendIds.map((id) => findGraphUserProfileById(id)))
      return resolved.map(mapUser).filter(Boolean)
    },
  },
}
