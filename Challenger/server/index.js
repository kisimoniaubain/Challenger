import cors from 'cors'
import cookieParser from 'cookie-parser'
import express from 'express'
import jwt from 'jsonwebtoken'
import multer from 'multer'
import { execute, subscribe } from 'graphql'
import { createServer } from 'node:http'
import { makeExecutableSchema } from '@graphql-tools/schema'
import { createHandler } from 'graphql-http/lib/use/express'
import { useServer } from 'graphql-ws/use/ws'
import { WebSocketServer } from 'ws'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { Storage as GcsStorage } from '@google-cloud/storage'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  getDatabaseMode,
  initDatabase,
  listMessages,
  listPosts,
  listStories,
  listUsers,
  replaceMessages,
  replacePosts,
  replaceStories,
  replaceUsers,
} from './db.js'
import {
  createCommentForPost,
  createConnection,
  deleteGraphMessage,
  deleteGraphPost,
  deleteGraphStory,
  createGraphMessage,
  createGraphPost,
  createGraphStory,
  createGraphUser,
  findGraphUserById,
  findGraphUserByIdentifier,
  graphLogin,
  graphResetPassword,
  getGraphDatabaseMode,
  initGraphDatabase,
  listCommentsByPost,
  listConnectionsByUser,
  listGraphMessages,
  listGraphPosts,
  listGraphStories,
  listGraphUsers,
  upsertGraphGoogleUser,
  updateGraphUser,
  updateGraphMessage,
  updateGraphPost,
  updateGraphStory,
  updateConnectionStatus,
} from './graphDb.js'
import { resolvers, schemaSource } from './graphql.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')

function loadEnvFile() {
  const envFilePath = path.join(projectRoot, '.env')
  if (!existsSync(envFilePath)) {
    return
  }

  const content = readFileSync(envFilePath, 'utf8')
  content.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) {
      return
    }

    const separatorIndex = trimmed.indexOf('=')
    if (separatorIndex <= 0) {
      return
    }

    const key = trimmed.slice(0, separatorIndex).trim()
    const value = trimmed.slice(separatorIndex + 1).trim().replace(/^"|"$/g, '')
    if (!process.env[key]) {
      process.env[key] = value
    }
  })
}

loadEnvFile()

function getAllowedGoogleClientIds() {
  const clientIdCsv = process.env.GOOGLE_CLIENT_IDS || ''
  const fromCsv = clientIdCsv
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

  const singleClientId = process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID
  return singleClientId ? [singleClientId, ...fromCsv] : fromCsv
}

function getPersistentRootDirectory() {
  if (process.env.CHALLENGER_DATA_DIR) {
    return process.env.CHALLENGER_DATA_DIR
  }

  if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
    return path.join(process.env.LOCALAPPDATA, 'Challenger')
  }

  return path.join(os.homedir(), '.challenger')
}

const uploadsDirectory = path.join(getPersistentRootDirectory(), 'uploads')
const legacyUploadsDirectory = path.join(__dirname, 'uploads')
const MAX_UPLOAD_SIZE_BYTES = Number(process.env.MAX_UPLOAD_SIZE_BYTES || 25 * 1024 * 1024)
const UPLOAD_RATE_LIMIT_WINDOW_MS = Number(process.env.UPLOAD_RATE_LIMIT_WINDOW_MS || 60_000)
const UPLOAD_RATE_LIMIT_MAX_SIGN = Number(process.env.UPLOAD_RATE_LIMIT_MAX_SIGN || 30)
const UPLOAD_RATE_LIMIT_MAX_UPLOAD = Number(process.env.UPLOAD_RATE_LIMIT_MAX_UPLOAD || 20)
const ALLOWED_UPLOAD_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml',
  'video/mp4',
  'video/webm',
  'audio/mpeg',
  'audio/mp4',
  'audio/wav',
  'audio/webm',
])

mkdirSync(uploadsDirectory, { recursive: true })

if (
  existsSync(legacyUploadsDirectory)
  && readdirSync(uploadsDirectory).length === 0
  && readdirSync(legacyUploadsDirectory).length > 0
) {
  cpSync(legacyUploadsDirectory, uploadsDirectory, { recursive: true })
}

const app = express()
const graphqlSchema = makeExecutableSchema({
  typeDefs: schemaSource,
  resolvers,
})
app.set('trust proxy', 1)

function isAllowedUploadMimeType(mimeType) {
  const normalized = String(mimeType || '').trim().toLowerCase()
  return ALLOWED_UPLOAD_MIME_TYPES.has(normalized)
}

function createRateLimiter({ windowMs, maxRequests }) {
  const requestHistory = new Map()

  return (request, response, next) => {
    const identifier = String(request.ip || request.headers['x-forwarded-for'] || 'unknown')
    const now = Date.now()
    const fromWindowStart = now - windowMs
    const currentHistory = (requestHistory.get(identifier) || []).filter((timestamp) => timestamp > fromWindowStart)

    if (currentHistory.length >= maxRequests) {
      response.status(429).json({ ok: false, message: 'Too many upload requests. Please try again shortly.' })
      return
    }

    currentHistory.push(now)
    requestHistory.set(identifier, currentHistory)
    next()
  }
}

const storage = multer.diskStorage({
  destination: (_request, _file, callback) => {
    callback(null, uploadsDirectory)
  },
  filename: (_request, file, callback) => {
    const extension = path.extname(file.originalname || '')
    callback(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${extension}`)
  },
})
const upload = multer({
  storage,
  limits: {
    fileSize: MAX_UPLOAD_SIZE_BYTES,
  },
  fileFilter: (_request, file, callback) => {
    if (!isAllowedUploadMimeType(file?.mimetype)) {
      callback(new Error('Unsupported file type.'))
      return
    }

    callback(null, true)
  },
})
const port = Number(process.env.PORT || 3001)
const SESSION_COOKIE_NAME = 'challenger_session'
const SESSION_SECRET = process.env.SESSION_SECRET || process.env.JWT_SECRET || 'challenger-dev-session-secret'
const SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 14
const STORAGE_PROVIDER = String(process.env.STORAGE_PROVIDER || 'local').trim().toLowerCase()
const S3_BUCKET = String(process.env.S3_BUCKET || '').trim()
const S3_REGION = String(process.env.S3_REGION || '').trim() || 'us-east-1'
const S3_ACCESS_KEY_ID = String(process.env.S3_ACCESS_KEY_ID || '').trim()
const S3_SECRET_ACCESS_KEY = String(process.env.S3_SECRET_ACCESS_KEY || '').trim()
const S3_PUBLIC_BASE_URL = String(process.env.S3_PUBLIC_BASE_URL || '').trim().replace(/\/$/, '')
const GCS_BUCKET = String(process.env.GCS_BUCKET || '').trim()
const GCS_PROJECT_ID = String(process.env.GCS_PROJECT_ID || '').trim()
const GCS_CLIENT_EMAIL = String(process.env.GCS_CLIENT_EMAIL || '').trim()
const GCS_PRIVATE_KEY = String(process.env.GCS_PRIVATE_KEY || '').replace(/\\n/g, '\n').trim()
const GCS_PUBLIC_BASE_URL = String(process.env.GCS_PUBLIC_BASE_URL || '').trim().replace(/\/$/, '')
const SUPABASE_URL = String(process.env.SUPABASE_URL || '').trim().replace(/\/$/, '')
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
const SUPABASE_BUCKET = String(process.env.SUPABASE_BUCKET || '').trim()
const SUPABASE_PUBLIC_BASE_URL = String(process.env.SUPABASE_PUBLIC_BASE_URL || '').trim().replace(/\/$/, '')

let s3Client = null
let gcsClient = null
let supabaseClient = null

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''))
}

function createSessionToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      username: user.username,
      provider: String(user.password_hash || '').startsWith('google:') ? 'google' : 'password',
    },
    SESSION_SECRET,
    { expiresIn: '14d' },
  )
}

function setSessionCookie(response, token) {
  response.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: SESSION_MAX_AGE_MS,
    path: '/',
  })
}

function clearSessionCookie(response) {
  response.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    path: '/',
  })
}

function readSessionFromRequest(request) {
  const token = request.cookies?.[SESSION_COOKIE_NAME]
  if (!token) {
    return null
  }

  try {
    const decoded = jwt.verify(token, SESSION_SECRET)
    return decoded
  } catch {
    return null
  }
}

async function requireGraphSession(request, response, next) {
  const session = readSessionFromRequest(request)
  if (!session?.sub || !isUuid(session.sub)) {
    response.status(401).json({ ok: false, message: 'Authentication required.' })
    return
  }

  const user = await findGraphUserById(session.sub)
  if (!user) {
    response.status(401).json({ ok: false, message: 'Session is invalid.' })
    return
  }

  request.graphSession = {
    userId: user.id,
    user,
  }

  next()
}

function toPublicGraphUser(user) {
  if (!user || typeof user !== 'object') {
    return user
  }

  const { password_hash, ...publicUser } = user
  return publicUser
}

function getStorageMode() {
  const hasS3Config = Boolean(
    STORAGE_PROVIDER === 's3'
    && S3_BUCKET
    && S3_REGION
    && S3_ACCESS_KEY_ID
    && S3_SECRET_ACCESS_KEY,
  )

  const hasGcsConfig = Boolean(
    STORAGE_PROVIDER === 'gcs'
    && GCS_BUCKET
    && GCS_PROJECT_ID
    && GCS_CLIENT_EMAIL
    && GCS_PRIVATE_KEY,
  )

  const hasSupabaseConfig = Boolean(
    STORAGE_PROVIDER === 'supabase'
    && SUPABASE_URL
    && SUPABASE_SERVICE_ROLE_KEY
    && SUPABASE_BUCKET,
  )

  if (hasS3Config) {
    return 's3'
  }

  if (hasGcsConfig) {
    return 'gcs'
  }

  if (hasSupabaseConfig) {
    return 'supabase'
  }

  return 'local'
}

function getS3Client() {
  if (getStorageMode() !== 's3') {
    return null
  }

  if (s3Client) {
    return s3Client
  }

  s3Client = new S3Client({
    region: S3_REGION,
    credentials: {
      accessKeyId: S3_ACCESS_KEY_ID,
      secretAccessKey: S3_SECRET_ACCESS_KEY,
    },
  })

  return s3Client
}

function getGcsClient() {
  if (getStorageMode() !== 'gcs') {
    return null
  }

  if (gcsClient) {
    return gcsClient
  }

  gcsClient = new GcsStorage({
    projectId: GCS_PROJECT_ID,
    credentials: {
      client_email: GCS_CLIENT_EMAIL,
      private_key: GCS_PRIVATE_KEY,
    },
  })

  return gcsClient
}

function getSupabaseClient() {
  if (getStorageMode() !== 'supabase') {
    return null
  }

  if (supabaseClient) {
    return supabaseClient
  }

  supabaseClient = createSupabaseClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })

  return supabaseClient
}

function buildS3PublicUrl(objectKey) {
  if (S3_PUBLIC_BASE_URL) {
    return `${S3_PUBLIC_BASE_URL}/${objectKey}`
  }

  return `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com/${objectKey}`
}

function buildGcsPublicUrl(objectKey) {
  if (GCS_PUBLIC_BASE_URL) {
    return `${GCS_PUBLIC_BASE_URL}/${objectKey}`
  }

  return `https://storage.googleapis.com/${GCS_BUCKET}/${objectKey}`
}

function buildSupabasePublicUrl(objectKey) {
  if (SUPABASE_PUBLIC_BASE_URL) {
    return `${SUPABASE_PUBLIC_BASE_URL}/${objectKey}`
  }

  return `${SUPABASE_URL}/storage/v1/object/public/${SUPABASE_BUCKET}/${objectKey}`
}

function encodePathSegments(pathValue) {
  return String(pathValue || '')
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')
}

function getStorageStatus() {
  const requiredByProvider = {
    s3: ['S3_BUCKET', 'S3_REGION', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'],
    gcs: ['GCS_BUCKET', 'GCS_PROJECT_ID', 'GCS_CLIENT_EMAIL', 'GCS_PRIVATE_KEY'],
    supabase: ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_BUCKET'],
  }

  const providerEnv = {
    s3: {
      S3_BUCKET,
      S3_REGION,
      S3_ACCESS_KEY_ID,
      S3_SECRET_ACCESS_KEY,
      S3_PUBLIC_BASE_URL,
    },
    gcs: {
      GCS_BUCKET,
      GCS_PROJECT_ID,
      GCS_CLIENT_EMAIL,
      GCS_PRIVATE_KEY,
      GCS_PUBLIC_BASE_URL,
    },
    supabase: {
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
      SUPABASE_BUCKET,
      SUPABASE_PUBLIC_BASE_URL,
    },
  }

  const provider = ['s3', 'gcs', 'supabase'].includes(STORAGE_PROVIDER) ? STORAGE_PROVIDER : 'local'
  const activeMode = getStorageMode()
  const requiredVars = requiredByProvider[provider] || []
  const activeEnv = providerEnv[provider] || {}
  const missingVars = requiredVars.filter((key) => !String(activeEnv[key] || '').trim())

  return {
    provider,
    activeMode,
    ready: provider === 'local' ? true : missingVars.length === 0,
    missingVars,
    hasPublicBaseUrl: Boolean(
      (provider === 's3' && S3_PUBLIC_BASE_URL)
      || (provider === 'gcs' && GCS_PUBLIC_BASE_URL)
      || (provider === 'supabase' && SUPABASE_PUBLIC_BASE_URL),
    ),
    signUploadEndpoint: '/api/storage/sign-upload',
  }
}

function sanitizeFilename(value) {
  const cleaned = String(value || '').trim().replace(/[^a-zA-Z0-9._-]+/g, '-')
  return cleaned.length > 0 ? cleaned : 'upload.bin'
}

function buildObjectKey(originalFilename, ownerId) {
  const now = new Date()
  const yyyy = String(now.getUTCFullYear())
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(now.getUTCDate()).padStart(2, '0')
  const ownerPrefix = isUuid(ownerId) ? ownerId : 'anonymous'
  return `uploads/${ownerPrefix}/${yyyy}/${mm}/${dd}/${randomUUID()}-${sanitizeFilename(originalFilename)}`
}

const limitSignUpload = createRateLimiter({
  windowMs: UPLOAD_RATE_LIMIT_WINDOW_MS,
  maxRequests: UPLOAD_RATE_LIMIT_MAX_SIGN,
})

const limitFileUpload = createRateLimiter({
  windowMs: UPLOAD_RATE_LIMIT_WINDOW_MS,
  maxRequests: UPLOAD_RATE_LIMIT_MAX_UPLOAD,
})

async function requireUploadSession(request, response, next) {
  const session = readSessionFromRequest(request)
  const canUseAnonymousUpload = getStorageMode() === 'local' && getGraphDatabaseMode() !== 'postgres'

  if (!session?.sub || !isUuid(session.sub)) {
    if (canUseAnonymousUpload) {
      request.uploadSession = {
        userId: 'anonymous',
        user: null,
      }
      next()
      return
    }

    response.status(401).json({ ok: false, message: 'Authentication required for uploads.' })
    return
  }

  const user = await findGraphUserById(session.sub)
  if (!user) {
    if (canUseAnonymousUpload) {
      request.uploadSession = {
        userId: 'anonymous',
        user: null,
      }
      next()
      return
    }

    response.status(401).json({ ok: false, message: 'Session is invalid.' })
    return
  }

  request.uploadSession = {
    userId: user.id,
    user,
  }

  next()
}

app.use(cors({ origin: true, credentials: true }))
app.use(cookieParser())
app.use(express.json({ limit: '25mb' }))
app.use('/uploads', express.static(uploadsDirectory))

const distDirectory = path.join(projectRoot, 'dist')
if (existsSync(distDirectory)) {
  app.use(express.static(distDirectory))
}

app.get('/api/health', (_request, response) => {
  response.json({
    ok: true,
    dataMode: getDatabaseMode(),
    graphDataMode: getGraphDatabaseMode(),
    storageMode: getStorageMode(),
  })
})

app.get('/api/storage/status', (_request, response) => {
  const status = getStorageStatus()
  response.json({ ok: true, ...status })
})

app.get('/api/graph/health', (_request, response) => {
  response.json({ ok: true, graphDataMode: getGraphDatabaseMode() })
})

app.all('/graphql', createHandler({
  schema: graphqlSchema,
  graphiql: process.env.NODE_ENV !== 'production',
  context: (request) => ({ request }),
}))

const httpServer = createServer(app)
const wsServer = new WebSocketServer({
  server: httpServer,
  path: '/graphql',
})

useServer(
  {
    schema: graphqlSchema,
    execute,
    subscribe,
    context: (ctx) => ({ request: ctx.extra.request }),
  },
  wsServer,
)

app.get('/api/graph/users', async (request, response) => {
  try {
    const users = await listGraphUsers({ limit: request.query.limit })
    response.json({ ok: true, users })
  } catch (error) {
    response.status(503).json({ ok: false, message: error?.message || 'Graph users unavailable.' })
  }
})

app.post('/api/graph/auth/login', async (request, response) => {
  const identifier = String(request.body?.identifier || '').trim()
  const password = String(request.body?.password || '')

  if (!identifier || !password) {
    response.status(400).json({ ok: false, message: 'identifier and password are required.' })
    return
  }

  try {
    const user = await graphLogin(identifier, password)
    if (!user) {
      response.status(401).json({ ok: false, message: 'Invalid account name/email or password.' })
      return
    }

    const token = createSessionToken(user)
    setSessionCookie(response, token)
    response.json({ ok: true, user: toPublicGraphUser(user) })
  } catch (error) {
    response.status(503).json({ ok: false, message: error?.message || 'Graph login unavailable.' })
  }
})

app.post('/api/graph/auth/register', async (request, response) => {
  try {
    const payload = request.body || {}
    const normalizedEmail = String(payload.email || '').trim().toLowerCase()
    const normalizedUsername = String(payload.username || '').trim().toLowerCase()

    if (!normalizedEmail || !normalizedUsername || !String(payload.displayName || '').trim()) {
      response.status(400).json({ ok: false, message: 'username, email, and displayName are required.' })
      return
    }

    const existing = await findGraphUserByIdentifier(normalizedEmail)
    if (existing) {
      response.status(409).json({ ok: false, message: 'An account with this email already exists.' })
      return
    }

    const user = await createGraphUser({
      ...payload,
      email: normalizedEmail,
      username: normalizedUsername,
    })
    const token = createSessionToken(user)
    setSessionCookie(response, token)
    response.status(201).json({ ok: true, user: toPublicGraphUser(user) })
  } catch (error) {
    response.status(400).json({ ok: false, message: error?.message || 'Failed to register graph user.' })
  }
})

app.post('/api/graph/auth/reset-password', async (request, response) => {
  const identifier = String(request.body?.identifier || '').trim()
  const nextPassword = String(request.body?.password || '')

  if (!identifier || !nextPassword) {
    response.status(400).json({ ok: false, message: 'identifier and password are required.' })
    return
  }

  try {
    const user = await graphResetPassword(identifier, nextPassword)
    if (!user) {
      response.status(404).json({ ok: false, message: 'No account found with that email or account name.' })
      return
    }

    response.json({ ok: true, user: toPublicGraphUser(user) })
  } catch (error) {
    response.status(400).json({ ok: false, message: error?.message || 'Failed to reset graph password.' })
  }
})

app.post('/api/graph/auth/google-upsert', async (request, response) => {
  try {
    const user = await upsertGraphGoogleUser(request.body || {})
    const token = createSessionToken(user)
    setSessionCookie(response, token)
    response.json({ ok: true, user: toPublicGraphUser(user) })
  } catch (error) {
    response.status(400).json({ ok: false, message: error?.message || 'Failed to upsert Google graph user.' })
  }
})

app.get('/api/graph/auth/session', async (request, response) => {
  const session = readSessionFromRequest(request)
  if (!session?.sub || !isUuid(session.sub)) {
    response.status(401).json({ ok: false, message: 'No active session.' })
    return
  }

  try {
    const user = await findGraphUserById(session.sub)
    if (!user) {
      clearSessionCookie(response)
      response.status(401).json({ ok: false, message: 'Session is invalid.' })
      return
    }

    response.json({ ok: true, user: toPublicGraphUser(user) })
  } catch (error) {
    response.status(503).json({ ok: false, message: error?.message || 'Failed to resolve session.' })
  }
})

app.post('/api/graph/auth/logout', (request, response) => {
  clearSessionCookie(response)
  response.json({ ok: true })
})

app.post('/api/graph/users', async (request, response) => {
  try {
    const user = await createGraphUser(request.body || {})
    response.status(201).json({ ok: true, user })
  } catch (error) {
    response.status(400).json({ ok: false, message: error?.message || 'Failed to create graph user.' })
  }
})

app.patch('/api/graph/users/:userId', requireGraphSession, async (request, response) => {
  const { userId } = request.params
  if (!isUuid(userId)) {
    response.status(400).json({ ok: false, message: 'userId must be a UUID.' })
    return
  }

  if (request.graphSession.userId !== userId) {
    response.status(403).json({ ok: false, message: 'Not allowed to update another user.' })
    return
  }

  try {
    const user = await updateGraphUser(userId, request.body || {})
    if (!user) {
      response.status(404).json({ ok: false, message: 'User not found.' })
      return
    }

    response.json({ ok: true, user: toPublicGraphUser(user) })
  } catch (error) {
    response.status(400).json({ ok: false, message: error?.message || 'Failed to update graph user.' })
  }
})

app.get('/api/graph/posts', async (request, response) => {
  try {
    const posts = await listGraphPosts({
      authorId: request.query.authorId,
      limit: request.query.limit,
    })
    response.json({ ok: true, posts })
  } catch (error) {
    response.status(503).json({ ok: false, message: error?.message || 'Graph posts unavailable.' })
  }
})

app.post('/api/graph/posts', requireGraphSession, async (request, response) => {
  try {
    const post = await createGraphPost({
      ...(request.body || {}),
      authorId: request.graphSession.userId,
    })
    response.status(201).json({ ok: true, post })
  } catch (error) {
    response.status(400).json({ ok: false, message: error?.message || 'Failed to create graph post.' })
  }
})

app.patch('/api/graph/posts/:postId', requireGraphSession, async (request, response) => {
  const { postId } = request.params
  if (!isUuid(postId)) {
    response.status(400).json({ ok: false, message: 'postId must be a UUID.' })
    return
  }

  try {
    const post = await updateGraphPost(postId, request.body || {})
    if (!post) {
      response.status(404).json({ ok: false, message: 'Post not found.' })
      return
    }
    response.json({ ok: true, post })
  } catch (error) {
    response.status(400).json({ ok: false, message: error?.message || 'Failed to update graph post.' })
  }
})

app.delete('/api/graph/posts/:postId', requireGraphSession, async (request, response) => {
  const { postId } = request.params
  if (!isUuid(postId)) {
    response.status(400).json({ ok: false, message: 'postId must be a UUID.' })
    return
  }

  try {
    const deleted = await deleteGraphPost(postId)
    if (!deleted) {
      response.status(404).json({ ok: false, message: 'Post not found.' })
      return
    }
    response.json({ ok: true, id: deleted.id })
  } catch (error) {
    response.status(400).json({ ok: false, message: error?.message || 'Failed to delete graph post.' })
  }
})

app.get('/api/graph/stories', async (request, response) => {
  try {
    const stories = await listGraphStories({
      authorId: request.query.authorId,
      limit: request.query.limit,
    })
    response.json({ ok: true, stories })
  } catch (error) {
    response.status(503).json({ ok: false, message: error?.message || 'Graph stories unavailable.' })
  }
})

app.post('/api/graph/stories', requireGraphSession, async (request, response) => {
  try {
    const story = await createGraphStory({
      ...(request.body || {}),
      authorId: request.graphSession.userId,
    })
    response.status(201).json({ ok: true, story })
  } catch (error) {
    response.status(400).json({ ok: false, message: error?.message || 'Failed to create graph story.' })
  }
})

app.patch('/api/graph/stories/:storyId', requireGraphSession, async (request, response) => {
  const { storyId } = request.params
  if (!isUuid(storyId)) {
    response.status(400).json({ ok: false, message: 'storyId must be a UUID.' })
    return
  }

  try {
    const story = await updateGraphStory(storyId, request.body || {})
    if (!story) {
      response.status(404).json({ ok: false, message: 'Story not found.' })
      return
    }
    response.json({ ok: true, story })
  } catch (error) {
    response.status(400).json({ ok: false, message: error?.message || 'Failed to update graph story.' })
  }
})

app.delete('/api/graph/stories/:storyId', requireGraphSession, async (request, response) => {
  const { storyId } = request.params
  if (!isUuid(storyId)) {
    response.status(400).json({ ok: false, message: 'storyId must be a UUID.' })
    return
  }

  try {
    const deleted = await deleteGraphStory(storyId)
    if (!deleted) {
      response.status(404).json({ ok: false, message: 'Story not found.' })
      return
    }
    response.json({ ok: true, id: deleted.id })
  } catch (error) {
    response.status(400).json({ ok: false, message: error?.message || 'Failed to delete graph story.' })
  }
})

app.get('/api/graph/messages', async (request, response) => {
  const userId = request.query.userId
  const peerId = request.query.peerId

  if (userId && !isUuid(userId)) {
    response.status(400).json({ ok: false, message: 'userId must be a UUID.' })
    return
  }

  if (peerId && !isUuid(peerId)) {
    response.status(400).json({ ok: false, message: 'peerId must be a UUID when provided.' })
    return
  }

  try {
    const messages = await listGraphMessages({
      userId,
      peerId,
      limit: request.query.limit,
    })
    response.json({ ok: true, messages })
  } catch (error) {
    response.status(503).json({ ok: false, message: error?.message || 'Graph messages unavailable.' })
  }
})

app.post('/api/graph/messages', requireGraphSession, async (request, response) => {
  try {
    const message = await createGraphMessage({
      ...(request.body || {}),
      fromUserId: request.graphSession.userId,
    })
    response.status(201).json({ ok: true, message })
  } catch (error) {
    response.status(400).json({ ok: false, message: error?.message || 'Failed to create graph message.' })
  }
})

app.patch('/api/graph/messages/:messageId', requireGraphSession, async (request, response) => {
  const { messageId } = request.params
  if (!isUuid(messageId)) {
    response.status(400).json({ ok: false, message: 'messageId must be a UUID.' })
    return
  }

  try {
    const message = await updateGraphMessage(messageId, request.body || {})
    if (!message) {
      response.status(404).json({ ok: false, message: 'Message not found.' })
      return
    }
    response.json({ ok: true, message })
  } catch (error) {
    response.status(400).json({ ok: false, message: error?.message || 'Failed to update graph message.' })
  }
})

app.delete('/api/graph/messages/:messageId', requireGraphSession, async (request, response) => {
  const { messageId } = request.params
  if (!isUuid(messageId)) {
    response.status(400).json({ ok: false, message: 'messageId must be a UUID.' })
    return
  }

  try {
    const deleted = await deleteGraphMessage(messageId)
    if (!deleted) {
      response.status(404).json({ ok: false, message: 'Message not found.' })
      return
    }
    response.json({ ok: true, id: deleted.id })
  } catch (error) {
    response.status(400).json({ ok: false, message: error?.message || 'Failed to delete graph message.' })
  }
})

app.get('/api/graph/posts/:postId/comments', async (request, response) => {
  const { postId } = request.params
  if (!isUuid(postId)) {
    response.status(400).json({ ok: false, message: 'postId must be a UUID.' })
    return
  }

  try {
    const comments = await listCommentsByPost(postId, { limit: request.query.limit })
    response.json({ ok: true, comments })
  } catch (error) {
    response.status(503).json({ ok: false, message: error?.message || 'Graph comments unavailable.' })
  }
})

app.post('/api/graph/posts/:postId/comments', requireGraphSession, async (request, response) => {
  const { postId } = request.params
  if (!isUuid(postId)) {
    response.status(400).json({ ok: false, message: 'postId must be a UUID.' })
    return
  }

  try {
    const comment = await createCommentForPost(postId, {
      ...(request.body || {}),
      authorId: request.graphSession.userId,
    })
    response.status(201).json({ ok: true, comment })
  } catch (error) {
    response.status(400).json({ ok: false, message: error?.message || 'Failed to create comment.' })
  }
})

app.get('/api/graph/connections', async (request, response) => {
  const userId = request.query.userId
  if (!isUuid(userId)) {
    response.status(400).json({ ok: false, message: 'userId must be a UUID.' })
    return
  }

  try {
    const connections = await listConnectionsByUser(userId, {
      relationType: request.query.relationType,
      status: request.query.status,
      limit: request.query.limit,
    })
    response.json({ ok: true, connections })
  } catch (error) {
    response.status(400).json({ ok: false, message: error?.message || 'Failed to list connections.' })
  }
})

app.post('/api/graph/connections', requireGraphSession, async (request, response) => {
  try {
    const connection = await createConnection({
      ...(request.body || {}),
      requesterId: request.graphSession.userId,
    })
    response.status(201).json({ ok: true, connection })
  } catch (error) {
    response.status(400).json({ ok: false, message: error?.message || 'Failed to create connection.' })
  }
})

app.patch('/api/graph/connections/:connectionId', requireGraphSession, async (request, response) => {
  const { connectionId } = request.params
  if (!isUuid(connectionId)) {
    response.status(400).json({ ok: false, message: 'connectionId must be a UUID.' })
    return
  }

  try {
    const connection = await updateConnectionStatus(connectionId, {
      ...(request.body || {}),
      actedBy: request.graphSession.userId,
    })
    if (!connection) {
      response.status(404).json({ ok: false, message: 'Connection not found.' })
      return
    }
    response.json({ ok: true, connection })
  } catch (error) {
    response.status(400).json({ ok: false, message: error?.message || 'Failed to update connection.' })
  }
})

app.get('/api/auth/google/config', (_request, response) => {
  const allowedClientIds = getAllowedGoogleClientIds()
  response.json({
    ok: true,
    clientId: allowedClientIds[0] || null,
    hasMultipleClientIds: allowedClientIds.length > 1,
  })
})

app.get('/api/users', async (_request, response) => {
  response.json(await listUsers())
})

app.put('/api/users/bulk', async (request, response) => {
  try {
    await replaceUsers(Array.isArray(request.body) ? request.body : [])
    response.json({ ok: true })
  } catch (error) {
    console.error(error)
    response.status(400).json({ ok: false, message: 'Failed to sync users.' })
  }
})

app.get('/api/posts', async (_request, response) => {
  response.json(await listPosts())
})

app.put('/api/posts/bulk', async (request, response) => {
  try {
    await replacePosts(Array.isArray(request.body) ? request.body : [])
    response.json({ ok: true })
  } catch (error) {
    console.error(error)
    response.status(400).json({ ok: false, message: 'Failed to sync posts.' })
  }
})

app.get('/api/stories', async (_request, response) => {
  response.json(await listStories())
})

app.put('/api/stories/bulk', async (request, response) => {
  try {
    await replaceStories(Array.isArray(request.body) ? request.body : [])
    response.json({ ok: true })
  } catch (error) {
    console.error(error)
    response.status(400).json({ ok: false, message: 'Failed to sync stories.' })
  }
})

app.get('/api/messages', async (_request, response) => {
  response.json(await listMessages())
})

app.put('/api/messages/bulk', async (request, response) => {
  try {
    await replaceMessages(Array.isArray(request.body) ? request.body : [])
    response.json({ ok: true })
  } catch (error) {
    console.error(error)
    response.status(400).json({ ok: false, message: 'Failed to sync messages.' })
  }
})

app.post('/api/auth/google', async (request, response) => {
  const credential = request.body?.credential

  if (!credential || typeof credential !== 'string') {
    console.log('❌ Missing credential:', { credentialType: typeof credential })
    response.status(400).json({ ok: false, message: 'Missing Google credential.' })
    return
  }

  try {
    console.log('📥 Verifying Google credential...')
    const verifyUrl = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`

    const verifyResponse = await fetch(verifyUrl)
    console.log('📥 Google API response status:', verifyResponse.status)

    if (!verifyResponse.ok) {
      const errorText = await verifyResponse.text()
      console.error('❌ Google verification failed:', { status: verifyResponse.status, error: errorText })
      response
        .status(401)
        .json({ ok: false, message: `Google token verification failed (${verifyResponse.status}). Check Google Cloud Console OAuth settings.` })
      return
    }

    const payload = await verifyResponse.json()
    console.log('✓ Google payload:', {
      email: payload.email,
      email_verified: payload.email_verified,
      aud: payload.aud,
      sub: payload.sub,
      name: payload.name,
    })

    const allowedClientIds = getAllowedGoogleClientIds()
    console.log('Checking client ID:', { payloadAud: payload.aud, allowedClientIdsCount: allowedClientIds.length })

    if (allowedClientIds.length && !allowedClientIds.includes(payload.aud)) {
      console.error('❌ Client ID mismatch:', { expected: allowedClientIds, got: payload.aud })
      response.status(401).json({
        ok: false,
        message: `Google client ID mismatch. Received: ${payload.aud}`,
      })
      return
    }

    if (!payload.email || payload.email_verified !== 'true' && payload.email_verified !== true) {
      console.error('❌ Email not verified:', { email: payload.email, email_verified: payload.email_verified })
      response.status(401).json({ ok: false, message: 'Google account email is not verified.' })
      return
    }

    const normalizedEmail = String(payload.email || '').trim().toLowerCase()
    const currentUsers = await listUsers()
    const existingUser = currentUsers.find(
      (user) => String(user?.email || '').trim().toLowerCase() === normalizedEmail,
    )

    const managedUser = existingUser
      ? {
          ...existingUser,
          name: String(payload.name || '').trim() || existingUser.name,
          avatar: payload.picture || existingUser.avatar || '',
          googleId: payload.sub || existingUser.googleId || null,
        }
      : {
          id: currentUsers.reduce((maxId, user) => Math.max(maxId, Number(user?.id) || 0), 0) + 1,
          name: String(payload.name || '').trim() || normalizedEmail.split('@')[0] || 'Google User',
          email: normalizedEmail,
          password: '',
          avatar: payload.picture || '',
          coverPhoto: '',
          totalVotes: 0,
          googleId: payload.sub || null,
          gender: '',
        }

    const nextUsers = existingUser
      ? currentUsers.map((user) => (user.id === existingUser.id ? managedUser : user))
      : [...currentUsers, managedUser]

    await replaceUsers(nextUsers)

    console.log('✓ Google verification successful for:', payload.email)
    response.json({
      ok: true,
      profile: {
        id: managedUser.id,
        email: payload.email,
        name: managedUser.name,
        avatar: managedUser.avatar,
        googleId: managedUser.googleId,
      },
      controlledBy: getDatabaseMode(),
    })
  } catch (error) {
    console.error('❌ Exception in Google auth:', error.message, error.stack)
    response.status(500).json({ ok: false, message: `Failed to verify Google login: ${error.message}` })
  }
})

app.post('/api/storage/sign-upload', limitSignUpload, requireUploadSession, async (request, response) => {
  const storageMode = getStorageMode()
  if (storageMode === 'local') {
    response.status(400).json({ ok: false, message: 'Cloud object storage is not configured.' })
    return
  }

  const originalFilename = sanitizeFilename(request.body?.filename || 'upload.bin')
  const contentType = String(request.body?.contentType || 'application/octet-stream').trim().toLowerCase()
  const fileSize = Number(request.body?.size || 0)

  if (!isAllowedUploadMimeType(contentType)) {
    response.status(400).json({ ok: false, message: 'Unsupported file type.' })
    return
  }

  if (!Number.isFinite(fileSize) || fileSize <= 0 || fileSize > MAX_UPLOAD_SIZE_BYTES) {
    response.status(400).json({ ok: false, message: `File size exceeds limit (${Math.round(MAX_UPLOAD_SIZE_BYTES / (1024 * 1024))} MB).` })
    return
  }

  const objectKey = buildObjectKey(originalFilename, request.uploadSession?.userId)

  try {
    if (storageMode === 's3') {
      const client = getS3Client()
      if (!client) {
        response.status(500).json({ ok: false, message: 'S3 client initialization failed.' })
        return
      }

      const command = new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: objectKey,
        ContentType: contentType,
        CacheControl: 'public, max-age=31536000, immutable',
      })

      const uploadUrl = await getSignedUrl(client, command, { expiresIn: 300 })

      response.json({
        ok: true,
        provider: 's3',
        method: 'PUT',
        uploadUrl,
        publicUrl: buildS3PublicUrl(objectKey),
        key: objectKey,
        contentType,
        expiresIn: 300,
      })
      return
    }

    if (storageMode === 'gcs') {
      const client = getGcsClient()
      if (!client) {
        response.status(500).json({ ok: false, message: 'GCS client initialization failed.' })
        return
      }

      const file = client.bucket(GCS_BUCKET).file(objectKey)
      const [uploadUrl] = await file.getSignedUrl({
        version: 'v4',
        action: 'write',
        expires: Date.now() + 5 * 60 * 1000,
        contentType,
      })

      response.json({
        ok: true,
        provider: 'gcs',
        method: 'PUT',
        uploadUrl,
        publicUrl: buildGcsPublicUrl(objectKey),
        key: objectKey,
        contentType,
        expiresIn: 300,
      })
      return
    }

    if (storageMode === 'supabase') {
      const client = getSupabaseClient()
      if (!client) {
        response.status(500).json({ ok: false, message: 'Supabase client initialization failed.' })
        return
      }

      const { data, error } = await client.storage.from(SUPABASE_BUCKET).createSignedUploadUrl(objectKey)

      if (error || !data?.token) {
        response.status(500).json({ ok: false, message: error?.message || 'Failed to create Supabase signed upload URL.' })
        return
      }

      const encodedObjectKey = encodePathSegments(objectKey)
      const uploadUrl = `${SUPABASE_URL}/storage/v1/object/upload/sign/${SUPABASE_BUCKET}/${encodedObjectKey}?token=${encodeURIComponent(data.token)}`

      response.json({
        ok: true,
        provider: 'supabase',
        method: 'PUT',
        uploadUrl,
        uploadHeaders: {
          'x-upsert': 'true',
        },
        publicUrl: buildSupabasePublicUrl(objectKey),
        key: objectKey,
        contentType,
        expiresIn: 300,
      })
      return
    }

    response.status(400).json({ ok: false, message: 'Unsupported storage provider.' })
  } catch (error) {
    response.status(500).json({ ok: false, message: error?.message || 'Failed to sign upload URL.' })
  }
})

app.post('/api/upload', limitFileUpload, requireUploadSession, (request, response) => {
  upload.single('file')(request, response, (error) => {
    if (error) {
      if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
        response.status(400).json({ ok: false, message: `File size exceeds limit (${Math.round(MAX_UPLOAD_SIZE_BYTES / (1024 * 1024))} MB).` })
        return
      }

      response.status(400).json({ ok: false, message: error?.message || 'Upload rejected.' })
      return
    }

    if (!request.file) {
      response.status(400).json({ ok: false, message: 'No file uploaded.' })
      return
    }

    const publicOrigin = `${request.protocol}://${request.get('host')}`

    response.json({
      ok: true,
      url: `${publicOrigin}/uploads/${request.file.filename}`,
      mimeType: request.file.mimetype,
      uploadMethod: 'local-fallback',
      uploadProvider: 'local',
    })
  })
})

if (existsSync(distDirectory)) {
  app.get('*', (_request, response) => {
    response.sendFile(path.join(distDirectory, 'index.html'))
  })
}

async function startServer() {
  try {
    const graphInit = await initGraphDatabase()
    if (!graphInit.ok) {
      console.warn(`Graph DB init skipped: ${graphInit.message || graphInit.mode}`)
    }

    await initDatabase()
    const dataMode = getDatabaseMode()
    const graphDataMode = getGraphDatabaseMode()
    httpServer.listen(port, () => {
      console.log(`Challenger server running on http://localhost:${port}`)
      console.log(`Data mode: ${dataMode}`)
      console.log(`Graph data mode: ${graphDataMode}`)
    })
  } catch (error) {
    console.error('Failed to connect to MongoDB:', error?.message || error)
    process.exit(1)
  }
}

startServer()