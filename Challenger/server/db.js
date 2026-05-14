import mongoose from 'mongoose'
import { users as seedUsers } from '../src/data/users.js'
import { posts as seedPosts } from '../src/data/posts.js'
import { messages as seedMessages } from '../src/data/messages.js'

const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/challenger'

const mediaItemSchema = new mongoose.Schema(
  {
    type: { type: String, default: null },
    url: { type: String, default: null },
  },
  { _id: false },
)

const userSchema = new mongoose.Schema(
  {
    id: { type: Number, required: true, unique: true, index: true },
    name: { type: String, required: true, default: '' },
    email: { type: String, required: true, unique: true, index: true, default: '' },
    password: { type: String, default: '' },
    avatar: { type: String, default: '' },
    coverPhoto: { type: String, default: '' },
    totalVotes: { type: Number, default: 0 },
    googleId: { type: String, default: null },
    gender: { type: String, default: '' },
  },
  { versionKey: false },
)

const postSchema = new mongoose.Schema(
  {
    id: { type: Number, required: true, unique: true, index: true },
    userId: { type: Number, required: true },
    timestamp: { type: String, required: true, default: '' },
    createdAt: { type: String, default: '' },
    text: { type: String, default: '' },
    mediaItems: { type: [mediaItemSchema], default: [] },
    mediaType: { type: String, default: null },
    mediaUrl: { type: String, default: null },
    likes: { type: Number, default: 0 },
    comments: { type: Number, default: 0 },
    shares: { type: Number, default: 0 },
    challengeVotes: { type: Number, default: 0 },
    challengeTitle: { type: String, default: '' },
  },
  { versionKey: false },
)

const storySchema = new mongoose.Schema(
  {
    id: { type: Number, required: true, unique: true, index: true },
    userId: { type: Number, required: true },
    timestamp: { type: String, required: true, default: '' },
    createdAt: { type: String, default: '' },
    text: { type: String, default: '' },
    mediaType: { type: String, default: null },
    mediaUrl: { type: String, default: null },
    musicUrl: { type: String, default: null },
    musicName: { type: String, default: '' },
    challengeTitle: { type: String, default: '' },
  },
  { versionKey: false },
)

const messageSchema = new mongoose.Schema(
  {
    id: { type: Number, required: true, unique: true, index: true },
    fromUserId: { type: Number, required: true },
    toUserId: { type: Number, required: true },
    text: { type: String, required: true, default: '' },
    timestamp: { type: String, required: true, default: '' },
  },
  { versionKey: false },
)

const User = mongoose.models.ChallengerUser || mongoose.model('ChallengerUser', userSchema)
const Post = mongoose.models.ChallengerPost || mongoose.model('ChallengerPost', postSchema)
const Story = mongoose.models.ChallengerStory || mongoose.model('ChallengerStory', storySchema)
const Message = mongoose.models.ChallengerMessage || mongoose.model('ChallengerMessage', messageSchema)

let hasInitializedDatabase = false
let databaseMode = 'mongo'

const memoryStore = {
  users: [],
  posts: [],
  stories: [],
  messages: [],
}

function toSafeNumber(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function dedupeBy(items, keyFn) {
  const map = new Map()
  for (const item of items || []) {
    const key = keyFn(item)
    if (key === null || key === undefined || key === '') {
      continue
    }
    map.set(String(key), item)
  }
  return Array.from(map.values())
}

function normalizeUsers(users) {
  const byId = dedupeBy(users, (user) => user?.id)
  return dedupeBy(byId, (user) => user?.email?.trim().toLowerCase())
}

function normalizeRows(rows) {
  return dedupeBy(rows, (row) => row?.id)
}

function normalizeMediaItems(mediaItems, mediaType, mediaUrl) {
  const normalizedItems = Array.isArray(mediaItems)
    ? mediaItems
      .map((item) => ({
        type: item?.type || null,
        url: item?.url || null,
      }))
      .filter((item) => item.type && item.url)
    : []

  if (normalizedItems.length > 0) {
    return normalizedItems
  }

  return mediaUrl && mediaType
    ? [{ type: mediaType, url: mediaUrl }]
    : []
}

function toStorySeedsFromPosts(posts) {
  return (posts || []).slice(0, 5).map((post) => ({
    id: toSafeNumber(post.id),
    userId: toSafeNumber(post.userId),
    timestamp: post.timestamp || 'Just now',
    createdAt: new Date().toISOString(),
    text: post.text || '',
    mediaType: post.mediaType || null,
    mediaUrl: post.mediaUrl || null,
    musicUrl: null,
    musicName: '',
    challengeTitle: post.challengeTitle || '',
  }))
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value))
}

function normalizeUserPayload(users) {
  return normalizeUsers(users).map((user) => ({
    id: toSafeNumber(user.id),
    name: user.name || '',
    email: String(user.email || '').trim().toLowerCase(),
    password: user.password || '',
    avatar: user.avatar || '',
    coverPhoto: user.coverPhoto || '',
    totalVotes: toSafeNumber(user.totalVotes),
    googleId: user.googleId || null,
    gender: user.gender || '',
  }))
}

function normalizePostPayload(posts) {
  return normalizeRows(posts).map((post) => {
    const mediaItems = normalizeMediaItems(post.mediaItems, post.mediaType, post.mediaUrl)
    return {
      id: toSafeNumber(post.id),
      userId: toSafeNumber(post.userId),
      timestamp: post.timestamp || 'Just now',
      createdAt: post.createdAt || new Date().toISOString(),
      text: post.text || '',
      mediaItems,
      mediaType: mediaItems.length > 0 ? mediaItems[0].type : (post.mediaType || null),
      mediaUrl: mediaItems.length > 0 ? mediaItems[0].url : (post.mediaUrl || null),
      likes: toSafeNumber(post.likes),
      comments: toSafeNumber(post.comments),
      shares: toSafeNumber(post.shares),
      challengeVotes: toSafeNumber(post.challengeVotes),
      challengeTitle: post.challengeTitle || '',
    }
  })
}

function normalizeStoryPayload(stories) {
  return normalizeRows(stories).map((story) => ({
    id: toSafeNumber(story.id),
    userId: toSafeNumber(story.userId),
    timestamp: story.timestamp || 'Just now',
    createdAt: story.createdAt || new Date().toISOString(),
    text: story.text || '',
    mediaType: story.mediaType || null,
    mediaUrl: story.mediaUrl || null,
    musicUrl: story.musicUrl || null,
    musicName: story.musicName || '',
    challengeTitle: story.challengeTitle || '',
  }))
}

function normalizeMessagePayload(messages) {
  return normalizeRows(messages).map((message) => ({
    id: toSafeNumber(message.id),
    fromUserId: toSafeNumber(message.fromUserId),
    toUserId: toSafeNumber(message.toUserId),
    text: message.text || '',
    timestamp: message.timestamp || 'Just now',
  }))
}

function seedMemoryStore() {
  memoryStore.users = normalizeUserPayload(seedUsers)
  memoryStore.posts = normalizePostPayload(seedPosts)
  memoryStore.stories = normalizeStoryPayload(toStorySeedsFromPosts(seedPosts))
  memoryStore.messages = normalizeMessagePayload(seedMessages)
}

async function ensureConnected() {
  if (mongoose.connection.readyState === 1) {
    return
  }

  await mongoose.connect(mongoUri, {
    serverSelectionTimeoutMS: 10000,
  })
}

async function seedIfEmpty() {
  const [usersCount, postsCount, storiesCount, messagesCount] = await Promise.all([
    User.countDocuments(),
    Post.countDocuments(),
    Story.countDocuments(),
    Message.countDocuments(),
  ])

  if (usersCount === 0) {
    await replaceUsers(seedUsers)
  }

  if (postsCount === 0) {
    await replacePosts(seedPosts)
  }

  if (storiesCount === 0) {
    await replaceStories(toStorySeedsFromPosts(seedPosts))
  }

  if (messagesCount === 0) {
    await replaceMessages(seedMessages)
  }
}

export async function initDatabase() {
  if (hasInitializedDatabase) {
    return
  }

  try {
    await ensureConnected()
    await seedIfEmpty()
    databaseMode = 'mongo'
  } catch (error) {
    databaseMode = 'memory'
    seedMemoryStore()
    console.warn('MongoDB unavailable. Falling back to in-memory data mode:', error?.message || error)
  }

  hasInitializedDatabase = true
}

export function getDatabaseMode() {
  return databaseMode
}

export async function replaceUsers(users) {
  const normalized = normalizeUserPayload(users)

  if (databaseMode === 'memory') {
    memoryStore.users = deepClone(normalized)
    return
  }

  await User.deleteMany({})
  if (normalized.length > 0) {
    await User.insertMany(normalized, { ordered: false })
  }
}

export async function replacePosts(posts) {
  const normalized = normalizePostPayload(posts)

  if (databaseMode === 'memory') {
    memoryStore.posts = deepClone(normalized)
    return
  }

  await Post.deleteMany({})
  if (normalized.length > 0) {
    await Post.insertMany(normalized, { ordered: false })
  }
}

export async function replaceStories(stories) {
  const normalized = normalizeStoryPayload(stories)

  if (databaseMode === 'memory') {
    memoryStore.stories = deepClone(normalized)
    return
  }

  await Story.deleteMany({})
  if (normalized.length > 0) {
    await Story.insertMany(normalized, { ordered: false })
  }
}

export async function replaceMessages(messages) {
  const normalized = normalizeMessagePayload(messages)

  if (databaseMode === 'memory') {
    memoryStore.messages = deepClone(normalized)
    return
  }

  await Message.deleteMany({})
  if (normalized.length > 0) {
    await Message.insertMany(normalized, { ordered: false })
  }
}

export async function listUsers() {
  if (databaseMode === 'memory') {
    return deepClone([...memoryStore.users].sort((left, right) => left.id - right.id))
  }

  return User.find({}).sort({ id: 1 }).lean()
}

export async function listPosts() {
  if (databaseMode === 'memory') {
    const posts = [...memoryStore.posts].sort((left, right) => right.id - left.id)
    return deepClone(posts).map((post) => {
      const mediaItems = normalizeMediaItems(post.mediaItems, post.mediaType, post.mediaUrl)
      return {
        ...post,
        mediaItems,
        mediaType: mediaItems.length > 0 ? mediaItems[0].type : (post.mediaType || null),
        mediaUrl: mediaItems.length > 0 ? mediaItems[0].url : (post.mediaUrl || null),
      }
    })
  }

  const posts = await Post.find({}).sort({ id: -1 }).lean()
  return posts.map((post) => {
    const mediaItems = normalizeMediaItems(post.mediaItems, post.mediaType, post.mediaUrl)
    return {
      ...post,
      mediaItems,
      mediaType: mediaItems.length > 0 ? mediaItems[0].type : (post.mediaType || null),
      mediaUrl: mediaItems.length > 0 ? mediaItems[0].url : (post.mediaUrl || null),
    }
  })
}

export async function listStories() {
  if (databaseMode === 'memory') {
    return deepClone([...memoryStore.stories].sort((left, right) => right.id - left.id))
  }

  return Story.find({}).sort({ id: -1 }).lean()
}

export async function listMessages() {
  if (databaseMode === 'memory') {
    return deepClone([...memoryStore.messages].sort((left, right) => left.id - right.id))
  }

  return Message.find({}).sort({ id: 1 }).lean()
}
