import { apolloClient } from './graphqlClient'
import {
  CREATE_MESSAGE_MUTATION,
  CREATE_POST_MUTATION,
  CREATE_STORY_MUTATION,
  DELETE_MESSAGE_MUTATION,
  DELETE_POST_MUTATION,
  DELETE_STORY_MUTATION,
  HOME_FEED_QUERY,
  UPDATE_MESSAGE_MUTATION,
  UPDATE_POST_MUTATION,
  UPDATE_STORY_MUTATION,
} from './graphqlQueries'

const API_BASE_STORAGE_KEY = 'challenger_api_base_url'
const LOCKED_API_BASE = (import.meta.env.VITE_LOCKED_API_BASE_URL || '').trim()
const GRAPH_ID_MAP_STORAGE_KEY = 'challenger_graph_id_map_v1'
const GRAPH_API_MODE = String(import.meta.env.VITE_GRAPH_API_MODE || 'auto').trim().toLowerCase()

let graphCapability = null

function defaultGraphIdMap() {
  return {
    users: {},
    posts: {},
    comments: {},
    stories: {},
    messages: {},
    next: {
      users: 100000,
      posts: 200000,
      comments: 300000,
      stories: 400000,
      messages: 500000,
    },
  }
}

function readGraphIdMap() {
  if (typeof window === 'undefined') {
    return defaultGraphIdMap()
  }

  try {
    const raw = window.localStorage.getItem(GRAPH_ID_MAP_STORAGE_KEY)
    if (!raw) {
      return defaultGraphIdMap()
    }

    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') {
      return defaultGraphIdMap()
    }

    return {
      users: parsed.users && typeof parsed.users === 'object' ? parsed.users : {},
      posts: parsed.posts && typeof parsed.posts === 'object' ? parsed.posts : {},
      comments: parsed.comments && typeof parsed.comments === 'object' ? parsed.comments : {},
      stories: parsed.stories && typeof parsed.stories === 'object' ? parsed.stories : {},
      messages: parsed.messages && typeof parsed.messages === 'object' ? parsed.messages : {},
      next: {
        users: Number(parsed.next?.users) || 100000,
        posts: Number(parsed.next?.posts) || 200000,
        comments: Number(parsed.next?.comments) || 300000,
        stories: Number(parsed.next?.stories) || 400000,
        messages: Number(parsed.next?.messages) || 500000,
      },
    }
  } catch {
    return defaultGraphIdMap()
  }
}

function writeGraphIdMap(map) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(GRAPH_ID_MAP_STORAGE_KEY, JSON.stringify(map))
}

function getLegacyIdForGraphUuid(entityType, graphUuid) {
  const safeUuid = String(graphUuid || '').trim()
  if (!safeUuid) {
    return null
  }

  const map = readGraphIdMap()
  const entityMap = map[entityType] || {}
  const existing = Number(entityMap[safeUuid])

  if (Number.isFinite(existing) && existing > 0) {
    return existing
  }

  const nextValue = Number(map.next?.[entityType]) || 1
  entityMap[safeUuid] = nextValue
  map[entityType] = entityMap
  map.next[entityType] = nextValue + 1
  writeGraphIdMap(map)
  return nextValue
}

function getGraphUuidForLegacyId(entityType, legacyId) {
  const safeLegacyId = Number(legacyId)
  if (!Number.isFinite(safeLegacyId) || safeLegacyId <= 0) {
    return null
  }

  const map = readGraphIdMap()
  const entityMap = map[entityType] || {}
  const entry = Object.entries(entityMap).find(([, mappedLegacyId]) => Number(mappedLegacyId) === safeLegacyId)
  return entry ? entry[0] : null
}

function bindGraphUuidToLegacyId(entityType, graphUuid, legacyId) {
  const safeUuid = String(graphUuid || '').trim()
  const safeLegacyId = Number(legacyId)

  if (!safeUuid || !Number.isFinite(safeLegacyId) || safeLegacyId <= 0) {
    return
  }

  const map = readGraphIdMap()
  const entityMap = map[entityType] || {}
  entityMap[safeUuid] = safeLegacyId
  map[entityType] = entityMap
  writeGraphIdMap(map)
}

function toRelativeTimestamp(isoLikeDate) {
  const createdAtMs = Date.parse(isoLikeDate || '')
  if (!Number.isFinite(createdAtMs)) {
    return 'Just now'
  }

  const diffMs = Math.max(0, Date.now() - createdAtMs)
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour
  const week = 7 * day

  if (diffMs < minute) return 'Just now'
  if (diffMs < hour) return `${Math.floor(diffMs / minute)}m ago`
  if (diffMs < day) return `${Math.floor(diffMs / hour)}h ago`
  if (diffMs < week) return `${Math.floor(diffMs / day)}d ago`
  return `${Math.floor(diffMs / week)}w ago`
}

function normalizeGraphUsers(graphUsers, apiBase) {
  return (graphUsers || []).map((user) => ({
    id: getLegacyIdForGraphUuid('users', user.id),
    graphId: user.id,
    name: user.display_name || user.username || user.email || 'Unknown User',
    email: user.email || '',
    password: '',
    avatar: rewriteUploadUrl(user.avatar_url || '', apiBase),
    coverPhoto: rewriteUploadUrl(user.cover_photo_url || '', apiBase),
    totalVotes: 0,
    googleId: null,
    gender: user.gender || '',
  }))
}

function normalizeGraphPosts(graphPosts, apiBase) {
  return (graphPosts || []).map((post) => {
    const authorLegacyId = getLegacyIdForGraphUuid('users', post.author_id)
    const mediaUrl = rewriteUploadUrl(post.media_url || null, apiBase)
    const mediaType = post.media_type || null

    return {
      id: getLegacyIdForGraphUuid('posts', post.id),
      graphId: post.id,
      userId: authorLegacyId,
      authorGraphId: post.author_id,
      timestamp: toRelativeTimestamp(post.created_at),
      createdAt: post.created_at || new Date().toISOString(),
      text: post.body || '',
      mediaItems: mediaUrl && mediaType ? [{ type: mediaType, url: mediaUrl }] : [],
      mediaType,
      mediaUrl,
      likes: Number(post.like_count || 0),
      comments: Number(post.comment_count || 0),
      shares: Number(post.share_count || 0),
      challengeVotes: 0,
      challengeTitle: '',
      postType: 'home',
    }
  })
}

function normalizeGraphStories(graphStories, apiBase) {
  return (graphStories || []).map((story) => ({
    id: getLegacyIdForGraphUuid('stories', story.id),
    graphId: story.id,
    userId: getLegacyIdForGraphUuid('users', story.author_id),
    authorGraphId: story.author_id,
    timestamp: toRelativeTimestamp(story.created_at),
    createdAt: story.created_at || new Date().toISOString(),
    text: story.body || '',
    mediaType: story.media_type || null,
    mediaUrl: rewriteUploadUrl(story.media_url || null, apiBase),
    musicUrl: rewriteUploadUrl(story.music_url || null, apiBase),
    musicName: story.music_name || '',
    challengeTitle: story.challenge_title || '',
  }))
}

function normalizeGraphMessages(graphMessages) {
  return (graphMessages || []).map((message) => ({
    id: getLegacyIdForGraphUuid('messages', message.id),
    graphId: message.id,
    fromUserId: getLegacyIdForGraphUuid('users', message.from_user_id),
    toUserId: getLegacyIdForGraphUuid('users', message.to_user_id),
    text: message.body || '',
    timestamp: toRelativeTimestamp(message.created_at),
    sentAt: message.created_at || new Date().toISOString(),
    editedAt: message.edited_at || null,
    replyTo: message.reply_message_id
      ? { graphId: message.reply_message_id }
      : null,
    forwardedFromMessageId: message.forwarded_from_message_id || null,
  }))
}

async function shouldUseGraphApi() {
  if (GRAPH_API_MODE === 'off') {
    return false
  }

  if (GRAPH_API_MODE === 'on') {
    return true
  }

  if (graphCapability !== null) {
    return graphCapability
  }

  try {
    const health = await requestJson('/graph/health')
    graphCapability = Boolean(health?.ok) && health?.graphDataMode === 'postgres'
    return graphCapability
  } catch {
    graphCapability = false
    return false
  }
}

async function loadGraphBackedState() {
  const [usersResult, postsResult, storiesResult, messagesResult] = await Promise.all([
    requestJson('/graph/users'),
    requestJson('/graph/posts'),
    requestJson('/graph/stories'),
    requestJson('/graph/messages?limit=300'),
  ])

  const connectedApiBase = activeApiBase
  const normalizedUsers = normalizeGraphUsers(usersResult?.users || [], connectedApiBase)
  const normalizedPosts = normalizeGraphPosts(postsResult?.posts || [], connectedApiBase)
  const graphMessages = Array.isArray(messagesResult?.messages) ? messagesResult.messages : []

  const dedupedByGraphId = new Map()
  graphMessages.forEach((message) => {
    if (message?.id) {
      dedupedByGraphId.set(message.id, message)
    }
  })

  const normalizedStories = normalizeGraphStories(storiesResult?.stories || [], connectedApiBase)
  const normalizedMessages = normalizeGraphMessages(Array.from(dedupedByGraphId.values()))

  return {
    users: normalizedUsers,
    posts: normalizedPosts,
    stories: normalizedStories,
    messages: normalizedMessages,
  }
}

function getApiBaseCandidates() {
  if (LOCKED_API_BASE) {
    return [LOCKED_API_BASE]
  }

  const envBase = import.meta.env.VITE_API_BASE_URL
  const rememberedBase = typeof window !== 'undefined'
    ? window.localStorage.getItem(API_BASE_STORAGE_KEY)
    : null
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173'

  return [
    `${origin}/api`,
    envBase,
    rememberedBase,
    `${origin.replace(/:\d+$/, ':3001')}/api`,
    `${origin.replace(/:\d+$/, ':3002')}/api`,
    'http://localhost:3001/api',
    'http://localhost:3002/api',
  ].filter((item, index, all) => item && all.indexOf(item) === index)
}

let activeApiBase = null

function rememberApiBase(baseUrl) {
  if (LOCKED_API_BASE) {
    return
  }

  activeApiBase = baseUrl
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(API_BASE_STORAGE_KEY, baseUrl)
  }
}

function rewriteUploadUrl(url, apiBase) {
  if (!url || typeof url !== 'string' || !apiBase) {
    return url
  }

  const activeOrigin = apiBase.replace(/\/api$/, '')

  if (url.startsWith('/uploads/')) {
    return `${activeOrigin}${url}`
  }

  const uploadPathMatch = url.match(/^https?:\/\/[^/]+(\/uploads\/.+)$/i)
  if (uploadPathMatch) {
    return `${activeOrigin}${uploadPathMatch[1]}`
  }

  return url
}

async function requestJsonWithBase(baseUrl, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  })

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`)
  }

  return response.json()
}

async function requestJson(path, options = {}) {
  const candidates = activeApiBase
    ? [activeApiBase, ...getApiBaseCandidates().filter((baseUrl) => baseUrl !== activeApiBase)]
    : getApiBaseCandidates()

  let lastError = null

  for (const baseUrl of candidates) {
    try {
      const data = await requestJsonWithBase(baseUrl, path, options)
      rememberApiBase(baseUrl)
      return data
    } catch (error) {
      lastError = error
    }
  }

  throw lastError || new Error('No reachable API server found.')
}

export async function requestApi(path, options = {}) {
  return requestJson(path, options)
}

export async function loadRemoteState() {
  if (await shouldUseGraphApi()) {
    try {
      return await loadGraphBackedState()
    } catch {
      graphCapability = false
    }
  }

  const [users, posts, stories, messages] = await Promise.all([
    requestJson('/users'),
    requestJson('/posts'),
    requestJson('/stories'),
    requestJson('/messages'),
  ])

  const connectedApiBase = activeApiBase
  const normalizedUsers = users.map((user) => ({
    ...user,
    avatar: rewriteUploadUrl(user.avatar, connectedApiBase),
    coverPhoto: rewriteUploadUrl(user.coverPhoto, connectedApiBase),
  }))
  const normalizedPosts = posts.map((post) => ({
    ...post,
    mediaItems: Array.isArray(post.mediaItems)
      ? post.mediaItems.map((item) => ({
        ...item,
        url: rewriteUploadUrl(item.url, connectedApiBase),
      }))
      : [],
    mediaUrl: rewriteUploadUrl(post.mediaUrl, connectedApiBase),
  }))
  const normalizedStories = stories.map((story) => ({
    ...story,
    mediaUrl: rewriteUploadUrl(story.mediaUrl, connectedApiBase),
    musicUrl: rewriteUploadUrl(story.musicUrl, connectedApiBase),
  }))

  return {
    users: normalizedUsers,
    posts: normalizedPosts,
    stories: normalizedStories,
    messages,
  }
}

export async function syncRemoteUsers(users) {
  return requestJson('/users/bulk', {
    method: 'PUT',
    body: JSON.stringify(users),
  })
}

export async function syncRemotePosts(posts) {
  return requestJson('/posts/bulk', {
    method: 'PUT',
    body: JSON.stringify(posts),
  })
}

export async function syncRemoteStories(stories) {
  return requestJson('/stories/bulk', {
    method: 'PUT',
    body: JSON.stringify(stories),
  })
}

export async function syncRemoteMessages(messages) {
  return requestJson('/messages/bulk', {
    method: 'PUT',
    body: JSON.stringify(messages),
  })
}

export async function verifyGoogleCredential(credential) {
  try {
    return await requestJson('/auth/google', {
      method: 'POST',
      body: JSON.stringify({ credential }),
    })
  } catch (err) {
    return {
      ok: false,
      message: `Google sign-in failed: ${err.message}. Make sure backend server is running.`,
    }
  }
}

export async function fetchGoogleAuthConfig() {
  try {
    return await requestJson('/auth/google/config')
  } catch {
    return { ok: false, clientId: null }
  }
}

export async function uploadMediaFile(file) {
  const fileName = String(file?.name || 'upload.bin')
  const fileType = String(file?.type || 'application/octet-stream')

  try {
    const signedUpload = await requestJson('/storage/sign-upload', {
      method: 'POST',
      body: JSON.stringify({
        filename: fileName,
        contentType: fileType,
        size: Number(file?.size || 0),
      }),
    })

    if (signedUpload?.uploadUrl && signedUpload?.publicUrl) {
      const signedHeaders = {
        ...(signedUpload.uploadHeaders || {}),
      }

      if (!signedHeaders['Content-Type'] && !signedHeaders['content-type']) {
        signedHeaders['Content-Type'] = signedUpload.contentType || fileType
      }

      const uploadResponse = await fetch(signedUpload.uploadUrl, {
        method: signedUpload.method || 'PUT',
        headers: signedHeaders,
        body: file,
      })

      if (!uploadResponse.ok) {
        throw new Error(`Bucket upload failed: ${uploadResponse.status}`)
      }

      return {
        url: signedUpload.publicUrl,
        mimeType: fileType,
        uploadMethod: 'signed-direct',
        uploadProvider: String(signedUpload.provider || 'unknown').toLowerCase(),
      }
    }
  } catch {
    // Fallback to server-managed local upload when bucket signing is unavailable.
  }

  const formData = new FormData()
  formData.append('file', file)

  const candidates = activeApiBase
    ? [activeApiBase, ...getApiBaseCandidates().filter((baseUrl) => baseUrl !== activeApiBase)]
    : getApiBaseCandidates()

  let lastError = null

  for (const baseUrl of candidates) {
    try {
      const response = await fetch(`${baseUrl}/upload`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      })

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.status}`)
      }

      rememberApiBase(baseUrl)
      const payload = await response.json()
      return {
        ...payload,
        url: rewriteUploadUrl(payload?.url, baseUrl),
        uploadMethod: 'local-fallback',
        uploadProvider: 'local',
      }
    } catch (error) {
      lastError = error
    }
  }

  throw lastError || new Error('Upload failed: no reachable API server found.')
}

export async function graphHealth() {
  return requestJson('/graph/health')
}

export async function isGraphApiReady() {
  return shouldUseGraphApi()
}

export function resolveGraphUuid(entityType, legacyId) {
  return getGraphUuidForLegacyId(entityType, legacyId)
}

export function linkGraphUuid(entityType, graphUuid, legacyId) {
  bindGraphUuidToLegacyId(entityType, graphUuid, legacyId)
}

export async function graphListUsers(limit = 30) {
  return requestJson(`/graph/users?limit=${encodeURIComponent(limit)}`)
}

export async function graphCreateUser(payload) {
  return requestJson('/graph/users', {
    method: 'POST',
    body: JSON.stringify(payload || {}),
  })
}

export async function graphLoginUser(identifier, password) {
  return requestJson('/graph/auth/login', {
    method: 'POST',
    body: JSON.stringify({ identifier, password }),
  })
}

export async function graphRegisterUser(payload) {
  return requestJson('/graph/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload || {}),
  })
}

export async function graphResetPassword(identifier, password) {
  return requestJson('/graph/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ identifier, password }),
  })
}

export async function graphUpsertGoogleUser(payload) {
  return requestJson('/graph/auth/google-upsert', {
    method: 'POST',
    body: JSON.stringify(payload || {}),
  })
}

export async function graphListPosts({ authorId = '', limit = 30 } = {}) {
  const params = new URLSearchParams()
  if (authorId) params.set('authorId', authorId)
  params.set('limit', String(limit))
  return requestJson(`/graph/posts?${params.toString()}`)
}

export async function graphCreatePost(payload) {
  try {
    const input = {
      body: String(payload?.body || ''),
      mediaUrl: payload?.mediaUrl ?? null,
      mediaType: payload?.mediaType ?? null,
      visibility: payload?.visibility || 'public',
    }

    const mutationResult = await apolloClient.mutate({
      mutation: CREATE_POST_MUTATION,
      variables: { input },
      update(cache, result) {
        const created = result?.data?.createPost
        if (!created) {
          return
        }

        ;[25, 40].forEach((limit) => {
          try {
            const existing = cache.readQuery({ query: HOME_FEED_QUERY, variables: { limit } })
            if (!existing?.feed || !Array.isArray(existing.feed)) {
              return
            }

            const alreadyExists = existing.feed.some((item) => String(item?.id) === String(created.id))
            if (alreadyExists) {
              return
            }

            cache.writeQuery({
              query: HOME_FEED_QUERY,
              variables: { limit },
              data: {
                feed: [created, ...existing.feed].slice(0, limit),
              },
            })
          } catch {
            // Ignore when cache entry has not been created yet.
          }
        })
      },
    })

    const created = mutationResult?.data?.createPost
    if (created?.id) {
      return {
        ok: true,
        post: {
          id: created.id,
          author_id: created.author?.id || payload?.authorId || null,
          body: created.body || '',
          media_url: created.mediaUrl || null,
          media_type: created.mediaType || null,
          visibility: created.visibility || 'public',
          like_count: Number(created.likeCount || 0),
          comment_count: Number(created.commentCount || 0),
          share_count: Number(created.shareCount || 0),
          created_at: created.createdAt || new Date().toISOString(),
        },
      }
    }
  } catch {
    // Fall back to REST graph endpoint.
  }

  return requestJson('/graph/posts', {
    method: 'POST',
    body: JSON.stringify(payload || {}),
  })
}

export async function graphUpdatePost(postId, payload) {
  try {
    const mutationResult = await apolloClient.mutate({
      mutation: UPDATE_POST_MUTATION,
      variables: {
        id: postId,
        input: {
          body: payload?.body,
          mediaUrl: payload?.mediaUrl,
          mediaType: payload?.mediaType,
          visibility: payload?.visibility,
        },
      },
    })

    const updated = mutationResult?.data?.updatePost
    if (updated?.id) {
      return {
        ok: true,
        post: {
          id: updated.id,
          author_id: updated.author?.id || null,
          body: updated.body || '',
          media_url: updated.mediaUrl || null,
          media_type: updated.mediaType || null,
          visibility: updated.visibility || 'public',
          like_count: Number(updated.likeCount || 0),
          comment_count: Number(updated.commentCount || 0),
          share_count: Number(updated.shareCount || 0),
          created_at: updated.createdAt || new Date().toISOString(),
        },
      }
    }
  } catch {
    // Fall back to REST graph endpoint.
  }

  return requestJson(`/graph/posts/${encodeURIComponent(postId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload || {}),
  })
}

export async function graphDeletePost(postId) {
  try {
    const mutationResult = await apolloClient.mutate({
      mutation: DELETE_POST_MUTATION,
      variables: { id: postId },
    })

    if (mutationResult?.data?.deletePost) {
      return { ok: true, id: postId }
    }
  } catch {
    // Fall back to REST graph endpoint.
  }

  return requestJson(`/graph/posts/${encodeURIComponent(postId)}`, {
    method: 'DELETE',
  })
}

export async function graphListComments(postId, limit = 50) {
  return requestJson(`/graph/posts/${encodeURIComponent(postId)}/comments?limit=${encodeURIComponent(limit)}`)
}

export async function graphCreateComment(postId, payload) {
  return requestJson(`/graph/posts/${encodeURIComponent(postId)}/comments`, {
    method: 'POST',
    body: JSON.stringify(payload || {}),
  })
}

export async function graphListConnections({ userId, relationType = '', status = '', limit = 50 }) {
  const params = new URLSearchParams()
  params.set('userId', userId)
  if (relationType) params.set('relationType', relationType)
  if (status) params.set('status', status)
  params.set('limit', String(limit))
  return requestJson(`/graph/connections?${params.toString()}`)
}

export async function graphCreateConnection(payload) {
  return requestJson('/graph/connections', {
    method: 'POST',
    body: JSON.stringify(payload || {}),
  })
}

export async function graphUpdateConnection(connectionId, payload) {
  return requestJson(`/graph/connections/${encodeURIComponent(connectionId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload || {}),
  })
}

export async function graphUpdateUser(userId, payload) {
  return requestJson(`/graph/users/${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload || {}),
  })
}

export async function graphListStories({ authorId = '', limit = 40 } = {}) {
  const params = new URLSearchParams()
  if (authorId) params.set('authorId', authorId)
  params.set('limit', String(limit))
  return requestJson(`/graph/stories?${params.toString()}`)
}

export async function graphCreateStory(payload) {
  try {
    const mutationResult = await apolloClient.mutate({
      mutation: CREATE_STORY_MUTATION,
      variables: {
        input: {
          body: String(payload?.body || ''),
          mediaUrl: payload?.mediaUrl ?? null,
          mediaType: payload?.mediaType ?? null,
          musicUrl: payload?.musicUrl ?? null,
          musicName: payload?.musicName ?? null,
          challengeTitle: payload?.challengeTitle ?? null,
          expiresAt: payload?.expiresAt ?? null,
        },
      },
    })

    const created = mutationResult?.data?.createStory
    if (created?.id) {
      return {
        ok: true,
        story: {
          id: created.id,
          author_id: created.author?.id || payload?.authorId || null,
          body: created.body || '',
          media_url: created.mediaUrl || null,
          media_type: created.mediaType || null,
          music_url: created.musicUrl || null,
          music_name: created.musicName || '',
          challenge_title: created.challengeTitle || '',
          created_at: created.createdAt || new Date().toISOString(),
          expires_at: created.expiresAt || null,
        },
      }
    }
  } catch {
    // Fall back to REST graph endpoint.
  }

  return requestJson('/graph/stories', {
    method: 'POST',
    body: JSON.stringify(payload || {}),
  })
}

export async function graphUpdateStory(storyId, payload) {
  try {
    const mutationResult = await apolloClient.mutate({
      mutation: UPDATE_STORY_MUTATION,
      variables: {
        id: storyId,
        input: {
          body: payload?.body,
          mediaUrl: payload?.mediaUrl,
          mediaType: payload?.mediaType,
          musicUrl: payload?.musicUrl,
          musicName: payload?.musicName,
          challengeTitle: payload?.challengeTitle,
        },
      },
    })

    const updated = mutationResult?.data?.updateStory
    if (updated?.id) {
      return {
        ok: true,
        story: {
          id: updated.id,
          author_id: updated.author?.id || null,
          body: updated.body || '',
          media_url: updated.mediaUrl || null,
          media_type: updated.mediaType || null,
          music_url: updated.musicUrl || null,
          music_name: updated.musicName || '',
          challenge_title: updated.challengeTitle || '',
          created_at: updated.createdAt || new Date().toISOString(),
          expires_at: updated.expiresAt || null,
        },
      }
    }
  } catch {
    // Fall back to REST graph endpoint.
  }

  return requestJson(`/graph/stories/${encodeURIComponent(storyId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload || {}),
  })
}

export async function graphDeleteStory(storyId) {
  try {
    const mutationResult = await apolloClient.mutate({
      mutation: DELETE_STORY_MUTATION,
      variables: { id: storyId },
    })

    if (mutationResult?.data?.deleteStory) {
      return { ok: true, id: storyId }
    }
  } catch {
    // Fall back to REST graph endpoint.
  }

  return requestJson(`/graph/stories/${encodeURIComponent(storyId)}`, {
    method: 'DELETE',
  })
}

export async function graphListMessages({ userId, peerId = '', limit = 120 }) {
  const params = new URLSearchParams()
  params.set('userId', userId)
  if (peerId) params.set('peerId', peerId)
  params.set('limit', String(limit))
  return requestJson(`/graph/messages?${params.toString()}`)
}

export async function graphCreateMessage(payload) {
  try {
    const mutationResult = await apolloClient.mutate({
      mutation: CREATE_MESSAGE_MUTATION,
      variables: {
        input: {
          toUserId: payload?.toUserId,
          body: String(payload?.body || ''),
          replyMessageId: payload?.replyMessageId || null,
          forwardedFromMessageId: payload?.forwardedFromMessageId || null,
        },
      },
    })

    const created = mutationResult?.data?.createMessage
    if (created?.id) {
      return {
        ok: true,
        message: {
          id: created.id,
          from_user_id: created.fromUser?.id || payload?.fromUserId || null,
          to_user_id: created.toUser?.id || payload?.toUserId || null,
          body: created.body || '',
          reply_message_id: created.replyMessageId || null,
          forwarded_from_message_id: created.forwardedFromMessageId || null,
          created_at: created.createdAt || new Date().toISOString(),
          edited_at: created.editedAt || null,
        },
      }
    }
  } catch {
    // Fall back to REST graph endpoint.
  }

  return requestJson('/graph/messages', {
    method: 'POST',
    body: JSON.stringify(payload || {}),
  })
}

export async function graphUpdateMessage(messageId, payload) {
  try {
    const mutationResult = await apolloClient.mutate({
      mutation: UPDATE_MESSAGE_MUTATION,
      variables: {
        id: messageId,
        input: {
          body: String(payload?.body || ''),
        },
      },
    })

    const updated = mutationResult?.data?.updateMessage
    if (updated?.id) {
      return {
        ok: true,
        message: {
          id: updated.id,
          from_user_id: updated.fromUser?.id || null,
          to_user_id: updated.toUser?.id || null,
          body: updated.body || '',
          reply_message_id: updated.replyMessageId || null,
          forwarded_from_message_id: updated.forwardedFromMessageId || null,
          created_at: updated.createdAt || new Date().toISOString(),
          edited_at: updated.editedAt || null,
        },
      }
    }
  } catch {
    // Fall back to REST graph endpoint.
  }

  return requestJson(`/graph/messages/${encodeURIComponent(messageId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload || {}),
  })
}

export async function graphDeleteMessage(messageId) {
  try {
    const mutationResult = await apolloClient.mutate({
      mutation: DELETE_MESSAGE_MUTATION,
      variables: { id: messageId },
    })

    if (mutationResult?.data?.deleteMessage) {
      return { ok: true, id: messageId }
    }
  } catch {
    // Fall back to REST graph endpoint.
  }

  return requestJson(`/graph/messages/${encodeURIComponent(messageId)}`, {
    method: 'DELETE',
  })
}

export async function graphFetchSession() {
  return requestJson('/graph/auth/session')
}

export async function graphLogoutSession() {
  return requestJson('/graph/auth/logout', {
    method: 'POST',
  })
}