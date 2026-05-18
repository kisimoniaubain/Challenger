import { createClient } from 'redis'
import { Pool } from 'pg'
import { compare, hash } from 'bcryptjs'

const GRAPH_DB_MODE = String(process.env.GRAPH_DB_MODE || 'disabled').trim().toLowerCase()
const POSTGRES_MODES = new Set(['postgres', 'postgresql', 'pg'])
const CONNECTION_TYPES = new Set(['friend', 'follow', 'block'])
const CONNECTION_STATUSES = new Set(['pending', 'accepted', 'declined', 'blocked'])
const STORY_MEDIA_TYPES = new Set(['image', 'video', 'text'])
const BCRYPT_ROUNDS = Math.max(8, Number.parseInt(String(process.env.BCRYPT_ROUNDS || '12'), 10) || 12)
const REDIS_URL = String(process.env.REDIS_URL || '').trim()
const PROFILE_CACHE_TTL_SECONDS = Math.max(
  60,
  Number.parseInt(String(process.env.REDIS_PROFILE_TTL_SECONDS || '300'), 10) || 300,
)
const PROFILE_CACHE_PREFIX = 'graph:user-profile'

let pool = null
let graphMode = 'disabled'
let redisClient = null
let redisClientPromise = null
let redisDisabled = false

function toNullable(value) {
  if (value === undefined || value === null) {
    return null
  }

  const normalized = String(value).trim()
  return normalized.length > 0 ? normalized : null
}

function isGraphEnabledByConfig() {
  return POSTGRES_MODES.has(GRAPH_DB_MODE)
}

function getConnectionString() {
  return (
    process.env.DATABASE_URL
    || process.env.POSTGRES_URL
    || process.env.PG_CONNECTION_STRING
    || ''
  )
}

function getSslConfig(connectionString) {
  if (process.env.PG_SSL === 'false') {
    return false
  }

  if (process.env.PG_SSL === 'true') {
    return { rejectUnauthorized: false }
  }

  return connectionString.includes('render.com')
    ? { rejectUnauthorized: false }
    : false
}

function getProfileCacheKey(userId) {
  return `${PROFILE_CACHE_PREFIX}:${String(userId || '').trim()}`
}

function sanitizeUserProfile(userRow) {
  if (!userRow) {
    return null
  }

  return {
    id: userRow.id,
    username: userRow.username,
    email: userRow.email,
    display_name: userRow.display_name,
    avatar_url: userRow.avatar_url,
    cover_photo_url: userRow.cover_photo_url,
    gender: userRow.gender,
    is_active: userRow.is_active,
    created_at: userRow.created_at,
    updated_at: userRow.updated_at,
  }
}

async function getRedisClient() {
  if (redisDisabled || !REDIS_URL) {
    return null
  }

  if (redisClient?.isReady) {
    return redisClient
  }

  if (redisClientPromise) {
    return redisClientPromise
  }

  redisClientPromise = (async () => {
    try {
      const client = createClient({ url: REDIS_URL })
      client.on('error', () => {})
      await client.connect()
      redisClient = client
      return client
    } catch {
      redisDisabled = true
      redisClient = null
      return null
    } finally {
      redisClientPromise = null
    }
  })()

  return redisClientPromise
}

async function readProfileCache(userId) {
  const client = await getRedisClient()
  if (!client) {
    return null
  }

  try {
    const rawValue = await client.get(getProfileCacheKey(userId))
    if (!rawValue) {
      return null
    }

    const parsedValue = JSON.parse(rawValue)
    return parsedValue && typeof parsedValue === 'object' ? parsedValue : null
  } catch {
    return null
  }
}

async function writeProfileCache(userRow) {
  const client = await getRedisClient()
  const safeUser = sanitizeUserProfile(userRow)
  if (!client || !safeUser?.id) {
    return false
  }

  try {
    await client.set(getProfileCacheKey(safeUser.id), JSON.stringify(safeUser), { EX: PROFILE_CACHE_TTL_SECONDS })
    return true
  } catch {
    return false
  }
}

export function getGraphDatabaseMode() {
  return graphMode
}

export async function initGraphDatabase() {
  if (!isGraphEnabledByConfig()) {
    graphMode = 'disabled'
    return { ok: true, mode: graphMode }
  }

  const connectionString = getConnectionString()
  if (!connectionString) {
    graphMode = 'disabled-no-url'
    return {
      ok: false,
      mode: graphMode,
      message: 'GRAPH_DB_MODE is postgres but DATABASE_URL is missing.',
    }
  }

  try {
    pool = new Pool({
      connectionString,
      ssl: getSslConfig(connectionString),
    })

    await pool.query('SELECT 1')
    graphMode = 'postgres'
    return { ok: true, mode: graphMode }
  } catch (error) {
    pool = null
    graphMode = 'disabled-error'
    return {
      ok: false,
      mode: graphMode,
      message: error?.message || 'Postgres connection failed.',
    }
  }
}

function requirePool() {
  if (!pool || graphMode !== 'postgres') {
    throw new Error('Graph database is not enabled. Set GRAPH_DB_MODE=postgres and DATABASE_URL.')
  }

  return pool
}

function normalizeLimit(value, fallback = 30, max = 100) {
  const parsed = Number.parseInt(String(value || ''), 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback
  }
  return Math.min(parsed, max)
}

function looksLikeBcrypt(value) {
  return /^\$2[aby]\$\d{2}\$/.test(String(value || ''))
}

function isGooglePasswordMarker(value) {
  return String(value || '').startsWith('google:')
}

async function toStoredPasswordValue(rawValue) {
  const normalized = toNullable(rawValue)
  if (!normalized) {
    return null
  }

  if (isGooglePasswordMarker(normalized) || looksLikeBcrypt(normalized)) {
    return normalized
  }

  return hash(normalized, BCRYPT_ROUNDS)
}

async function verifyPassword(storedValue, plainText) {
  const stored = String(storedValue || '')
  const input = String(plainText || '')

  if (!stored || !input || isGooglePasswordMarker(stored)) {
    return false
  }

  if (looksLikeBcrypt(stored)) {
    return compare(input, stored)
  }

  return stored === input
}

export async function listGraphUsers({ limit } = {}) {
  const db = requirePool()
  const safeLimit = normalizeLimit(limit, 30, 100)

  const result = await db.query(
    `SELECT id, username, email, display_name, avatar_url, cover_photo_url, gender, is_active, created_at, updated_at
     FROM users
     ORDER BY created_at DESC
     LIMIT $1`,
    [safeLimit],
  )

  return result.rows
}

export async function createGraphUser(payload) {
  const db = requirePool()

  const username = toNullable(payload?.username)
  const email = toNullable(payload?.email)?.toLowerCase()
  const displayName = toNullable(payload?.displayName)
  const passwordHash = await toStoredPasswordValue(payload?.passwordHash)
  const avatarUrl = toNullable(payload?.avatarUrl)
  const coverPhotoUrl = toNullable(payload?.coverPhotoUrl)
  const gender = toNullable(payload?.gender)

  if (!username || !email || !displayName) {
    throw new Error('username, email, and displayName are required.')
  }

  const result = await db.query(
    `INSERT INTO users (username, email, display_name, password_hash, avatar_url, cover_photo_url, gender)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, username, email, display_name, avatar_url, cover_photo_url, gender, is_active, created_at, updated_at`,
    [username, email, displayName, passwordHash, avatarUrl, coverPhotoUrl, gender],
  )

  const createdUser = result.rows[0] || null
  await writeProfileCache(createdUser)
  return createdUser
}

export async function updateGraphUser(userId, payload) {
  const db = requirePool()

  const username = payload?.username === undefined ? undefined : toNullable(payload?.username)
  const email = payload?.email === undefined ? undefined : toNullable(payload?.email)?.toLowerCase()
  const displayName = payload?.displayName === undefined ? undefined : toNullable(payload?.displayName)
  const passwordHash = payload?.passwordHash === undefined
    ? undefined
    : await toStoredPasswordValue(payload?.passwordHash)
  const avatarUrl = payload?.avatarUrl === undefined ? undefined : toNullable(payload?.avatarUrl)
  const coverPhotoUrl = payload?.coverPhotoUrl === undefined ? undefined : toNullable(payload?.coverPhotoUrl)
  const gender = payload?.gender === undefined ? undefined : toNullable(payload?.gender)

  const sets = ['updated_at = NOW()']
  const values = []

  if (username !== undefined) {
    values.push(username)
    sets.push(`username = $${values.length}`)
  }

  if (email !== undefined) {
    values.push(email)
    sets.push(`email = $${values.length}`)
  }

  if (displayName !== undefined) {
    values.push(displayName)
    sets.push(`display_name = $${values.length}`)
  }

  if (passwordHash !== undefined) {
    values.push(passwordHash)
    sets.push(`password_hash = $${values.length}`)
  }

  if (avatarUrl !== undefined) {
    values.push(avatarUrl)
    sets.push(`avatar_url = $${values.length}`)
  }

  if (coverPhotoUrl !== undefined) {
    values.push(coverPhotoUrl)
    sets.push(`cover_photo_url = $${values.length}`)
  }

  if (gender !== undefined) {
    values.push(gender)
    sets.push(`gender = $${values.length}`)
  }

  values.push(userId)

  const result = await db.query(
    `UPDATE users
     SET ${sets.join(', ')}
     WHERE id = $${values.length}
     RETURNING id, username, email, display_name, password_hash, avatar_url, cover_photo_url, gender, is_active, created_at, updated_at`,
    values,
  )

  const updatedUser = result.rows[0] || null
  await writeProfileCache(updatedUser)
  return updatedUser
}

export async function findGraphUserProfileById(userId) {
  const normalized = toNullable(userId)
  if (!normalized) {
    return null
  }

  const cachedUser = await readProfileCache(normalized)
  if (cachedUser) {
    return cachedUser
  }

  const db = requirePool()
  const result = await db.query(
    `SELECT id, username, email, display_name, avatar_url, cover_photo_url, gender, is_active, created_at, updated_at
     FROM users
     WHERE id = $1
     LIMIT 1`,
    [normalized],
  )

  const user = result.rows[0] || null
  await writeProfileCache(user)
  return user
}

export async function findGraphUserByIdentifier(identifier) {
  const db = requirePool()
  const normalized = String(identifier || '').trim().toLowerCase()
  if (!normalized) {
    return null
  }

  const result = await db.query(
    `SELECT id, username, email, display_name, password_hash, avatar_url, cover_photo_url, gender, is_active, created_at, updated_at
     FROM users
     WHERE LOWER(email) = $1 OR LOWER(username) = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [normalized],
  )

  return result.rows[0] || null
}

export async function findGraphUserById(userId) {
  const db = requirePool()
  const normalized = toNullable(userId)
  if (!normalized) {
    return null
  }

  const result = await db.query(
    `SELECT id, username, email, display_name, password_hash, avatar_url, cover_photo_url, gender, is_active, created_at, updated_at
     FROM users
     WHERE id = $1
     LIMIT 1`,
    [normalized],
  )

  return result.rows[0] || null
}

export async function graphLogin(identifier, password) {
  const db = requirePool()
  const user = await findGraphUserByIdentifier(identifier)
  if (!user) {
    return null
  }

  const storedPassword = String(user.password_hash || '')
  const isValid = await verifyPassword(storedPassword, password)
  if (!isValid) {
    return null
  }

  if (storedPassword && !looksLikeBcrypt(storedPassword) && !isGooglePasswordMarker(storedPassword)) {
    const upgradedHash = await toStoredPasswordValue(password)
    await db.query(
      `UPDATE users
       SET password_hash = $2,
           updated_at = NOW()
       WHERE id = $1`,
      [user.id, upgradedHash],
    )
    user.password_hash = upgradedHash
  }

  return user
}

export async function graphResetPassword(identifier, nextPassword) {
  const db = requirePool()
  const user = await findGraphUserByIdentifier(identifier)
  if (!user) {
    return null
  }

  const hashedPassword = await toStoredPasswordValue(nextPassword)

  const result = await db.query(
    `UPDATE users
     SET password_hash = $2,
         updated_at = NOW()
     WHERE id = $1
     RETURNING id, username, email, display_name, password_hash, avatar_url, cover_photo_url, gender, is_active, created_at, updated_at`,
    [user.id, hashedPassword],
  )

  return result.rows[0] || null
}

export async function upsertGraphGoogleUser(payload) {
  const db = requirePool()

  const email = toNullable(payload?.email)?.toLowerCase()
  const name = toNullable(payload?.name)
  const avatar = toNullable(payload?.avatar)
  const googleId = toNullable(payload?.googleId)

  if (!email) {
    throw new Error('email is required for Google upsert.')
  }

  const localPart = email.split('@')[0] || 'challenger'
  const usernameBase = localPart.replace(/[^a-z0-9._-]/gi, '').toLowerCase() || 'challenger'
  const displayName = name || localPart
  const passwordHash = googleId ? `google:${googleId}` : ''

  const existingByEmail = await db.query(
    `SELECT id FROM users WHERE LOWER(email) = $1 LIMIT 1`,
    [email],
  )

  if (existingByEmail.rows.length > 0) {
    const existingId = existingByEmail.rows[0].id
    const updated = await updateGraphUser(existingId, {
      displayName,
      avatarUrl: avatar,
      passwordHash,
    })
    return updated
  }

  let usernameCandidate = usernameBase
  let attempt = 0
  while (attempt < 20) {
    const usernameCheck = await db.query(
      `SELECT 1 FROM users WHERE LOWER(username) = $1 LIMIT 1`,
      [usernameCandidate],
    )

    if (usernameCheck.rows.length === 0) {
      break
    }

    attempt += 1
    usernameCandidate = `${usernameBase}${attempt}`
  }

  return createGraphUser({
    username: usernameCandidate,
    email,
    displayName,
    passwordHash,
    avatarUrl: avatar,
  })
}

export async function listGraphPosts({ authorId, limit } = {}) {
  const db = requirePool()
  const safeLimit = normalizeLimit(limit, 30, 100)

  const values = [safeLimit]
  let whereClause = ''

  if (authorId) {
    values.push(authorId)
    whereClause = 'WHERE p.author_id = $2'
  }

  const result = await db.query(
    `SELECT p.id, p.author_id, p.body, p.media_url, p.media_type, p.visibility, p.like_count, p.comment_count, p.share_count, p.created_at, p.updated_at,
            u.username AS author_username, u.display_name AS author_display_name, u.avatar_url AS author_avatar_url
     FROM posts p
     JOIN users u ON u.id = p.author_id
     ${whereClause}
     ORDER BY p.created_at DESC
     LIMIT $1`,
    values,
  )

  return result.rows
}

export async function findGraphPostById(postId) {
  const db = requirePool()
  const result = await db.query(
    `SELECT p.id, p.author_id, p.body, p.media_url, p.media_type, p.visibility, p.like_count, p.comment_count, p.share_count, p.created_at, p.updated_at,
            u.username AS author_username, u.display_name AS author_display_name, u.avatar_url AS author_avatar_url
     FROM posts p
     JOIN users u ON u.id = p.author_id
     WHERE p.id = $1
     LIMIT 1`,
    [postId],
  )

  return result.rows[0] || null
}

export async function createGraphPost(payload) {
  const db = requirePool()

  const authorId = toNullable(payload?.authorId)
  const body = String(payload?.body || '')
  const mediaUrl = toNullable(payload?.mediaUrl)
  const mediaType = toNullable(payload?.mediaType)
  const visibility = String(payload?.visibility || 'public').toLowerCase()

  if (!authorId) {
    throw new Error('authorId is required.')
  }

  if (!['public', 'friends', 'private'].includes(visibility)) {
    throw new Error('visibility must be public, friends, or private.')
  }

  const result = await db.query(
    `INSERT INTO posts (author_id, body, media_url, media_type, visibility)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, author_id, body, media_url, media_type, visibility, like_count, comment_count, share_count, created_at, updated_at`,
    [authorId, body, mediaUrl, mediaType, visibility],
  )

  return result.rows[0]
}

export async function updateGraphPost(postId, payload) {
  const db = requirePool()

  const body = toNullable(payload?.body)
  const mediaUrl = payload?.mediaUrl === undefined ? undefined : toNullable(payload?.mediaUrl)
  const mediaType = payload?.mediaType === undefined ? undefined : toNullable(payload?.mediaType)
  const visibility = payload?.visibility === undefined
    ? undefined
    : String(payload?.visibility || '').toLowerCase()

  if (visibility !== undefined && !['public', 'friends', 'private'].includes(visibility)) {
    throw new Error('visibility must be public, friends, or private.')
  }

  const sets = ['updated_at = NOW()']
  const values = []

  if (body !== undefined) {
    values.push(body || '')
    sets.push(`body = $${values.length}`)
  }

  if (mediaUrl !== undefined) {
    values.push(mediaUrl)
    sets.push(`media_url = $${values.length}`)
  }

  if (mediaType !== undefined) {
    values.push(mediaType)
    sets.push(`media_type = $${values.length}`)
  }

  if (visibility !== undefined) {
    values.push(visibility)
    sets.push(`visibility = $${values.length}`)
  }

  values.push(postId)

  const result = await db.query(
    `UPDATE posts
     SET ${sets.join(', ')}
     WHERE id = $${values.length}
     RETURNING id, author_id, body, media_url, media_type, visibility, like_count, comment_count, share_count, created_at, updated_at`,
    values,
  )

  return result.rows[0] || null
}

export async function deleteGraphPost(postId) {
  const db = requirePool()
  const result = await db.query('DELETE FROM posts WHERE id = $1 RETURNING id', [postId])
  return result.rows[0] || null
}

export async function listGraphStories({ authorId, limit } = {}) {
  const db = requirePool()
  const safeLimit = normalizeLimit(limit, 40, 200)

  const values = [safeLimit]
  let whereClause = ''

  if (authorId) {
    values.push(authorId)
    whereClause = 'WHERE s.author_id = $2'
  }

  const result = await db.query(
    `SELECT s.id, s.author_id, s.body, s.media_url, s.media_type, s.music_url, s.music_name, s.challenge_title, s.expires_at, s.created_at, s.updated_at,
            u.username AS author_username, u.display_name AS author_display_name, u.avatar_url AS author_avatar_url
     FROM stories s
     JOIN users u ON u.id = s.author_id
     ${whereClause}
     ORDER BY s.created_at DESC
     LIMIT $1`,
    values,
  )

  return result.rows
}

export async function findGraphStoryById(storyId) {
  const db = requirePool()
  const result = await db.query(
    `SELECT s.id, s.author_id, s.body, s.media_url, s.media_type, s.music_url, s.music_name, s.challenge_title, s.expires_at, s.created_at, s.updated_at,
            u.username AS author_username, u.display_name AS author_display_name, u.avatar_url AS author_avatar_url
     FROM stories s
     JOIN users u ON u.id = s.author_id
     WHERE s.id = $1
     LIMIT 1`,
    [storyId],
  )

  return result.rows[0] || null
}

export async function createGraphStory(payload) {
  const db = requirePool()

  const authorId = toNullable(payload?.authorId)
  const body = String(payload?.body || '')
  const mediaUrl = toNullable(payload?.mediaUrl)
  const mediaTypeRaw = toNullable(payload?.mediaType)
  const musicUrl = toNullable(payload?.musicUrl)
  const musicName = toNullable(payload?.musicName)
  const challengeTitle = toNullable(payload?.challengeTitle)
  const expiresAt = toNullable(payload?.expiresAt)

  if (!authorId) {
    throw new Error('authorId is required.')
  }

  let mediaType = mediaTypeRaw
  if (!mediaType && !mediaUrl && body) {
    mediaType = 'text'
  }

  if (mediaType && !STORY_MEDIA_TYPES.has(mediaType)) {
    throw new Error('mediaType must be image, video, or text.')
  }

  const result = await db.query(
    `INSERT INTO stories (author_id, body, media_url, media_type, music_url, music_name, challenge_title, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8::timestamptz, NOW() + INTERVAL '24 hours'))
     RETURNING id, author_id, body, media_url, media_type, music_url, music_name, challenge_title, expires_at, created_at, updated_at`,
    [authorId, body, mediaUrl, mediaType, musicUrl, musicName, challengeTitle, expiresAt],
  )

  return result.rows[0]
}

export async function updateGraphStory(storyId, payload) {
  const db = requirePool()

  const body = payload?.body === undefined ? undefined : String(payload?.body || '')
  const mediaUrl = payload?.mediaUrl === undefined ? undefined : toNullable(payload?.mediaUrl)
  const mediaType = payload?.mediaType === undefined ? undefined : toNullable(payload?.mediaType)
  const musicUrl = payload?.musicUrl === undefined ? undefined : toNullable(payload?.musicUrl)
  const musicName = payload?.musicName === undefined ? undefined : toNullable(payload?.musicName)
  const challengeTitle = payload?.challengeTitle === undefined ? undefined : toNullable(payload?.challengeTitle)

  if (mediaType !== undefined && mediaType !== null && !STORY_MEDIA_TYPES.has(mediaType)) {
    throw new Error('mediaType must be image, video, or text.')
  }

  const sets = ['updated_at = NOW()']
  const values = []

  if (body !== undefined) {
    values.push(body)
    sets.push(`body = $${values.length}`)
  }

  if (mediaUrl !== undefined) {
    values.push(mediaUrl)
    sets.push(`media_url = $${values.length}`)
  }

  if (mediaType !== undefined) {
    values.push(mediaType)
    sets.push(`media_type = $${values.length}`)
  }

  if (musicUrl !== undefined) {
    values.push(musicUrl)
    sets.push(`music_url = $${values.length}`)
  }

  if (musicName !== undefined) {
    values.push(musicName)
    sets.push(`music_name = $${values.length}`)
  }

  if (challengeTitle !== undefined) {
    values.push(challengeTitle)
    sets.push(`challenge_title = $${values.length}`)
  }

  values.push(storyId)

  const result = await db.query(
    `UPDATE stories
     SET ${sets.join(', ')}
     WHERE id = $${values.length}
     RETURNING id, author_id, body, media_url, media_type, music_url, music_name, challenge_title, expires_at, created_at, updated_at`,
    values,
  )

  return result.rows[0] || null
}

export async function deleteGraphStory(storyId) {
  const db = requirePool()
  const result = await db.query('DELETE FROM stories WHERE id = $1 RETURNING id', [storyId])
  return result.rows[0] || null
}

export async function listGraphMessages({ userId, peerId, limit } = {}) {
  const db = requirePool()
  const safeLimit = normalizeLimit(limit, 80, 300)

  const values = []
  const filters = []

  if (userId) {
    values.push(userId)
    filters.push(`(m.from_user_id = $${values.length} OR m.to_user_id = $${values.length})`)
  }

  if (peerId) {
    values.push(peerId)
    filters.push(`(m.from_user_id = $${values.length} OR m.to_user_id = $${values.length})`)
  }

  values.push(safeLimit)
  const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : ''

  const result = await db.query(
    `SELECT m.id, m.from_user_id, m.to_user_id, m.body, m.reply_message_id, m.forwarded_from_message_id, m.created_at, m.updated_at, m.edited_at,
            from_u.username AS from_username,
            to_u.username AS to_username
     FROM messages m
     JOIN users from_u ON from_u.id = m.from_user_id
     JOIN users to_u ON to_u.id = m.to_user_id
     ${whereClause}
     ORDER BY m.created_at ASC
     LIMIT $${values.length}`,
    values,
  )

  return result.rows
}

export async function findGraphMessageById(messageId) {
  const db = requirePool()
  const result = await db.query(
    `SELECT m.id, m.from_user_id, m.to_user_id, m.body, m.reply_message_id, m.forwarded_from_message_id, m.created_at, m.updated_at, m.edited_at,
            from_u.username AS from_username,
            to_u.username AS to_username
     FROM messages m
     JOIN users from_u ON from_u.id = m.from_user_id
     JOIN users to_u ON to_u.id = m.to_user_id
     WHERE m.id = $1
     LIMIT 1`,
    [messageId],
  )

  return result.rows[0] || null
}

export async function createGraphMessage(payload) {
  const db = requirePool()

  const fromUserId = toNullable(payload?.fromUserId)
  const toUserId = toNullable(payload?.toUserId)
  const body = toNullable(payload?.body)
  const replyMessageId = toNullable(payload?.replyMessageId)
  const forwardedFromMessageId = toNullable(payload?.forwardedFromMessageId)

  if (!fromUserId || !toUserId || !body) {
    throw new Error('fromUserId, toUserId, and body are required.')
  }

  const result = await db.query(
    `INSERT INTO messages (from_user_id, to_user_id, body, reply_message_id, forwarded_from_message_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, from_user_id, to_user_id, body, reply_message_id, forwarded_from_message_id, created_at, updated_at, edited_at`,
    [fromUserId, toUserId, body, replyMessageId, forwardedFromMessageId],
  )

  return result.rows[0]
}

export async function updateGraphMessage(messageId, payload) {
  const db = requirePool()
  const body = toNullable(payload?.body)

  if (!body) {
    throw new Error('body is required.')
  }

  const result = await db.query(
    `UPDATE messages
     SET body = $2,
         edited_at = NOW(),
         updated_at = NOW()
     WHERE id = $1
     RETURNING id, from_user_id, to_user_id, body, reply_message_id, forwarded_from_message_id, created_at, updated_at, edited_at`,
    [messageId, body],
  )

  return result.rows[0] || null
}

export async function deleteGraphMessage(messageId) {
  const db = requirePool()
  const result = await db.query('DELETE FROM messages WHERE id = $1 RETURNING id', [messageId])
  return result.rows[0] || null
}

export async function listCommentsByPost(postId, { limit } = {}) {
  const db = requirePool()
  const safeLimit = normalizeLimit(limit, 50, 200)

  const result = await db.query(
    `SELECT c.id, c.post_id, c.author_id, c.parent_comment_id, c.body, c.created_at, c.updated_at,
            u.username AS author_username, u.display_name AS author_display_name, u.avatar_url AS author_avatar_url
     FROM comments c
     JOIN users u ON u.id = c.author_id
     WHERE c.post_id = $1
     ORDER BY c.created_at ASC
     LIMIT $2`,
    [postId, safeLimit],
  )

  return result.rows
}

export async function createCommentForPost(postId, payload) {
  const db = requirePool()

  const authorId = toNullable(payload?.authorId)
  const parentCommentId = toNullable(payload?.parentCommentId)
  const body = toNullable(payload?.body)

  if (!authorId || !body) {
    throw new Error('authorId and body are required for a comment.')
  }

  const client = await db.connect()

  try {
    await client.query('BEGIN')

    const insertResult = await client.query(
      `INSERT INTO comments (post_id, author_id, parent_comment_id, body)
       VALUES ($1, $2, $3, $4)
       RETURNING id, post_id, author_id, parent_comment_id, body, created_at, updated_at`,
      [postId, authorId, parentCommentId, body],
    )

    await client.query(
      `UPDATE posts
       SET comment_count = comment_count + 1,
           updated_at = NOW()
       WHERE id = $1`,
      [postId],
    )

    await client.query('COMMIT')
    return insertResult.rows[0]
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function listConnectionsByUser(userId, { relationType, status, limit } = {}) {
  const db = requirePool()
  const safeLimit = normalizeLimit(limit, 50, 200)

  const values = [userId]
  const filters = ['(c.requester_id = $1 OR c.addressee_id = $1)']

  if (relationType) {
    if (!CONNECTION_TYPES.has(relationType)) {
      throw new Error('relationType must be friend, follow, or block.')
    }
    values.push(relationType)
    filters.push(`c.relation_type = $${values.length}`)
  }

  if (status) {
    if (!CONNECTION_STATUSES.has(status)) {
      throw new Error('status must be pending, accepted, declined, or blocked.')
    }
    values.push(status)
    filters.push(`c.status = $${values.length}`)
  }

  values.push(safeLimit)

  const result = await db.query(
    `SELECT c.id, c.requester_id, c.addressee_id, c.relation_type, c.status, c.acted_by, c.created_at, c.updated_at,
            requester.username AS requester_username,
            addressee.username AS addressee_username
     FROM connections c
     JOIN users requester ON requester.id = c.requester_id
     JOIN users addressee ON addressee.id = c.addressee_id
     WHERE ${filters.join(' AND ')}
     ORDER BY c.created_at DESC
     LIMIT $${values.length}`,
    values,
  )

  return result.rows
}

export async function createConnection(payload) {
  const db = requirePool()

  const requesterId = toNullable(payload?.requesterId)
  const addresseeId = toNullable(payload?.addresseeId)
  const relationType = String(payload?.relationType || 'friend').toLowerCase()

  if (!requesterId || !addresseeId) {
    throw new Error('requesterId and addresseeId are required.')
  }

  if (!CONNECTION_TYPES.has(relationType)) {
    throw new Error('relationType must be friend, follow, or block.')
  }

  const result = await db.query(
    `INSERT INTO connections (requester_id, addressee_id, relation_type, status)
     VALUES ($1, $2, $3, 'pending')
     RETURNING id, requester_id, addressee_id, relation_type, status, acted_by, created_at, updated_at`,
    [requesterId, addresseeId, relationType],
  )

  return result.rows[0]
}

export async function updateConnectionStatus(connectionId, payload) {
  const db = requirePool()

  const status = String(payload?.status || '').toLowerCase()
  const actedBy = toNullable(payload?.actedBy)

  if (!CONNECTION_STATUSES.has(status)) {
    throw new Error('status must be pending, accepted, declined, or blocked.')
  }

  const result = await db.query(
    `UPDATE connections
     SET status = $2,
         acted_by = $3,
         updated_at = NOW()
     WHERE id = $1
     RETURNING id, requester_id, addressee_id, relation_type, status, acted_by, created_at, updated_at`,
    [connectionId, status, actedBy],
  )

  return result.rows[0] || null
}
