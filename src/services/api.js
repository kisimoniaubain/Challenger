const API_BASE_STORAGE_KEY = 'challenger_api_base_url'
const LOCKED_API_BASE = (import.meta.env.VITE_API_BASE_URL || '').trim()

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
  return url.replace(/^https?:\/\/localhost:\d+\/uploads\//i, `${activeOrigin}/uploads/`)
}

async function requestJsonWithBase(baseUrl, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
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

export async function loadRemoteState() {
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
        body: formData,
      })

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.status}`)
      }

      rememberApiBase(baseUrl)
      return response.json()
    } catch (error) {
      lastError = error
    }
  }

  throw lastError || new Error('Upload failed: no reachable API server found.')
}