import cors from 'cors'
import express from 'express'
import multer from 'multer'
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  listMessages,
  listPosts,
  listStories,
  listUsers,
  replaceMessages,
  replacePosts,
  replaceStories,
  replaceUsers,
} from './db.js'

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

mkdirSync(uploadsDirectory, { recursive: true })

if (
  existsSync(legacyUploadsDirectory)
  && readdirSync(uploadsDirectory).length === 0
  && readdirSync(legacyUploadsDirectory).length > 0
) {
  cpSync(legacyUploadsDirectory, uploadsDirectory, { recursive: true })
}

const app = express()
app.set('trust proxy', 1)
const storage = multer.diskStorage({
  destination: (_request, _file, callback) => {
    callback(null, uploadsDirectory)
  },
  filename: (_request, file, callback) => {
    const extension = path.extname(file.originalname || '')
    callback(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${extension}`)
  },
})
const upload = multer({ storage })
const port = Number(process.env.PORT || 3001)

app.use(cors())
app.use(express.json({ limit: '25mb' }))
app.use('/uploads', express.static(uploadsDirectory))

const distDirectory = path.join(projectRoot, 'dist')
if (existsSync(distDirectory)) {
  app.use(express.static(distDirectory))
}

app.get('/api/health', (_request, response) => {
  response.json({ ok: true })
})

app.get('/api/auth/google/config', (_request, response) => {
  const allowedClientIds = getAllowedGoogleClientIds()
  response.json({
    ok: true,
    clientId: allowedClientIds[0] || null,
    hasMultipleClientIds: allowedClientIds.length > 1,
  })
})

app.get('/api/users', (_request, response) => {
  response.json(listUsers())
})

app.put('/api/users/bulk', (request, response) => {
  try {
    replaceUsers(Array.isArray(request.body) ? request.body : [])
    response.json({ ok: true })
  } catch (error) {
    console.error(error)
    response.status(400).json({ ok: false, message: 'Failed to sync users.' })
  }
})

app.get('/api/posts', (_request, response) => {
  response.json(listPosts())
})

app.put('/api/posts/bulk', (request, response) => {
  try {
    replacePosts(Array.isArray(request.body) ? request.body : [])
    response.json({ ok: true })
  } catch (error) {
    console.error(error)
    response.status(400).json({ ok: false, message: 'Failed to sync posts.' })
  }
})

app.get('/api/stories', (_request, response) => {
  response.json(listStories())
})

app.put('/api/stories/bulk', (request, response) => {
  try {
    replaceStories(Array.isArray(request.body) ? request.body : [])
    response.json({ ok: true })
  } catch (error) {
    console.error(error)
    response.status(400).json({ ok: false, message: 'Failed to sync stories.' })
  }
})

app.get('/api/messages', (_request, response) => {
  response.json(listMessages())
})

app.put('/api/messages/bulk', (request, response) => {
  try {
    replaceMessages(Array.isArray(request.body) ? request.body : [])
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

    console.log('✓ Google verification successful for:', payload.email)
    response.json({
      ok: true,
      profile: {
        email: payload.email,
        name: payload.name || payload.email.split('@')[0],
        avatar: payload.picture || '',
        googleId: payload.sub || null,
      },
    })
  } catch (error) {
    console.error('❌ Exception in Google auth:', error.message, error.stack)
    response.status(500).json({ ok: false, message: `Failed to verify Google login: ${error.message}` })
  }
})

app.post('/api/upload', upload.single('file'), (request, response) => {
  if (!request.file) {
    response.status(400).json({ message: 'No file uploaded.' })
    return
  }

  const publicOrigin = `${request.protocol}://${request.get('host')}`

  response.json({
    url: `${publicOrigin}/uploads/${request.file.filename}`,
    mimeType: request.file.mimetype,
  })
})

if (existsSync(distDirectory)) {
  app.get('*', (_request, response) => {
    response.sendFile(path.join(distDirectory, 'index.html'))
  })
}

app.listen(port, () => {
  console.log(`Challenger server running on http://localhost:${port}`)
})