import { useEffect, useState } from 'react'
import TopNav from './components/TopNav'
import BottomNav from './components/BottomNav'
import HomePage from './pages/HomePage'
import ChallengesPage from './pages/ChallengesPage'
import NotificationsPage from './pages/NotificationsPage'
import MessagesPage from './pages/MessagesPage'
import PeoplePage from './pages/PeoplePage'
import UserProfilePage from './pages/UserProfilePage'
import MenuPage from './pages/MenuPage'
import SettingsPage from './pages/SettingsPage'
import LanguagePage from './pages/LanguagePage'
import LoginPage from './pages/LoginPage'
import {
  loadRemoteState,
  syncRemoteMessages,
  syncRemotePosts,
  syncRemoteStories,
  syncRemoteUsers,
} from './services/api'
import { users as usersData } from './data/users'
import { messages as messagesData } from './data/messages'
import { posts as postsData } from './data/posts'
import { createTranslator, isSupportedLanguage } from './utils/i18n'

const SESSION_KEY = 'challenger_session_user_id'
const ACTIVE_TAB_KEY = 'challenger_active_tab'
const THEME_KEY = 'challenger_theme'
const USERS_KEY = 'challenger_users'
const ACCOUNT_STORE_KEY = 'challenger_account_store'
const POSTS_KEY = 'challenger_posts'
const STORIES_KEY = 'challenger_stories'
const MESSAGES_KEY = 'challenger_messages'
const NOTIFICATIONS_KEY = 'challenger_notifications'
const NOTIFICATIONS_LAST_SEEN_AT_KEY = 'challenger_notifications_last_seen_at'
const HOME_LAST_SEEN_AT_KEY = 'challenger_home_last_seen_at'
const CHALLENGES_LAST_SEEN_AT_KEY = 'challenger_challenges_last_seen_at'
const MESSAGES_LAST_SEEN_ID_KEY = 'challenger_messages_last_seen_id'
const FOLLOWING_KEY = 'challenger_following_user_ids'
const LANGUAGE_KEY = 'challenger_language'
const POST_TYPE_HOME = 'home'
const POST_TYPE_CHALLENGE = 'challenge'
const POST_EDIT_WINDOW_MS = 10 * 60 * 1000
const MESSAGE_EDIT_WINDOW_MS = 5 * 60 * 1000
const AUTO_STORY_MUSIC_LIBRARY = [
  {
    name: 'Story Pop Pulse',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
  },
  {
    name: 'Sunset Afro Vibe',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3',
  },
  {
    name: 'Chill Evening Flow',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3',
  },
  {
    name: 'Midnight Story Beat',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-9.mp3',
  },
]

function getAutoStoryMusic(story) {
  const hasExplicitMusic = Boolean(story?.musicUrl)
  if (hasExplicitMusic || story?.mediaType !== 'image') {
    return {
      musicUrl: story?.musicUrl || null,
      musicName: story?.musicName || '',
    }
  }

  const numericSeed = Number(story?.id || story?.userId || 0)
  const safeSeed = Number.isFinite(numericSeed) ? Math.abs(numericSeed) : 0
  const pickedTrack = AUTO_STORY_MUSIC_LIBRARY[safeSeed % AUTO_STORY_MUSIC_LIBRARY.length]

  return {
    musicUrl: pickedTrack.url,
    musicName: pickedTrack.name,
  }
}

const initialStories = postsData.slice(0, 5).map((post) => ({
  id: post.id,
  userId: post.userId,
  timestamp: post.timestamp,
  createdAt: new Date().toISOString(),
  text: post.text,
  mediaType: post.mediaType,
  mediaUrl: post.mediaUrl,
  musicUrl: null,
  musicName: '',
  challengeTitle: post.challengeTitle,
}))

function normalizeStories(stories) {
  return (stories || []).map((story) => ({
    ...story,
    createdAt: story.createdAt || new Date().toISOString(),
    ...getAutoStoryMusic(story),
  }))
}

function inferPostType(post) {
  if (post?.postType === POST_TYPE_HOME || post?.postType === POST_TYPE_CHALLENGE) {
    return post.postType
  }

  const challengeTitle = String(post?.challengeTitle || '').toLowerCase()
  if (
    Number(post?.challengeVotes || 0) > 0
    || challengeTitle.includes('challenge')
    || challengeTitle.includes('entry')
  ) {
    return POST_TYPE_CHALLENGE
  }

  return POST_TYPE_HOME
}

function resolveLegacyPostCreatedAt(post) {
  if (post?.createdAt) {
    return post.createdAt
  }

  const rawTimestamp = String(post?.timestamp || '').trim().toLowerCase()
  const now = Date.now()

  if (!rawTimestamp || rawTimestamp === 'just now') {
    return new Date(now).toISOString()
  }

  const relativeMatch = rawTimestamp.match(/^(\d+)\s*([mhdw])(?:\s*ago)?$/)
  if (relativeMatch) {
    const amount = Number(relativeMatch[1])
    const unit = relativeMatch[2]
    const unitMs = {
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
      w: 7 * 24 * 60 * 60 * 1000,
    }[unit]

    if (Number.isFinite(amount) && unitMs) {
      return new Date(now - amount * unitMs).toISOString()
    }
  }

  return new Date(now).toISOString()
}

function normalizePosts(posts) {
  return (posts || []).map((post) => ({
    ...post,
    mediaItems: Array.isArray(post?.mediaItems) && post.mediaItems.length > 0
      ? post.mediaItems
        .map((item) => ({
          type: item?.type || null,
          url: item?.url || null,
        }))
        .filter((item) => item.type && item.url)
      : (post?.mediaUrl && post?.mediaType
        ? [{ type: post.mediaType, url: post.mediaUrl }]
        : []),
    createdAt: resolveLegacyPostCreatedAt(post),
    postType: inferPostType(post),
  })).map((post) => ({
    ...post,
    mediaType: post.mediaItems.length > 0 ? post.mediaItems[0].type : (post.mediaType || null),
    mediaUrl: post.mediaItems.length > 0 ? post.mediaItems[0].url : (post.mediaUrl || null),
  }))
}

function canEditPostWithinWindow(post) {
  const createdAtMs = Date.parse(post?.createdAt || '')
  if (!Number.isFinite(createdAtMs)) {
    return true
  }

  return Date.now() - createdAtMs <= POST_EDIT_WINDOW_MS
}

function readSessionUserId() {
  const value = Number(localStorage.getItem(SESSION_KEY))
  return Number.isFinite(value) && value > 0 ? value : null
}

function readStoredJson(key, fallbackValue) {
  try {
    const rawValue = localStorage.getItem(key)
    if (!rawValue) {
      return fallbackValue
    }

    const parsedValue = JSON.parse(rawValue)
    return Array.isArray(parsedValue) ? parsedValue : fallbackValue
  } catch {
    return fallbackValue
  }
}

function readStoredUsers(key) {
  const storedUsers = readStoredJson(key, [])
  return Array.isArray(storedUsers) ? storedUsers : []
}

function readStoredRecord(key, fallbackValue) {
  try {
    const rawValue = localStorage.getItem(key)
    if (!rawValue) {
      return fallbackValue
    }

    const parsedValue = JSON.parse(rawValue)
    return parsedValue && typeof parsedValue === 'object' && !Array.isArray(parsedValue)
      ? parsedValue
      : fallbackValue
  } catch {
    return fallbackValue
  }
}

function normalizeIdentifierValue(value) {
  return String(value || '').trim().toLowerCase()
}

function normalizeAccountName(value) {
  return normalizeIdentifierValue(value).replace(/\s+/g, ' ')
}

function normalizeAccountNameCompact(value) {
  return normalizeAccountName(value).replace(/\s+/g, '')
}

function normalizeLooseIdentifier(value) {
  return normalizeIdentifierValue(value).replace(/[^a-z0-9]/g, '')
}

function findUserByIdentifier(users, identifier) {
  const normalizedIdentifier = normalizeIdentifierValue(identifier)
  if (!normalizedIdentifier) {
    return null
  }

  const normalizedName = normalizedAccountName(identifier)
  const normalizedNameCompact = normalizeAccountNameCompact(identifier)
  const normalizedLoose = normalizeLooseIdentifier(identifier)
  return users.find((user) => {
    const userEmail = normalizeIdentifierValue(user.email)
    const userName = normalizeAccountName(user.name)
    const userNameCompact = normalizeAccountNameCompact(user.name)
    const emailLocalPart = userEmail.split('@')[0] || ''
    const userLooseName = normalizeLooseIdentifier(user.name)
    const userLooseEmailLocal = normalizeLooseIdentifier(emailLocalPart)

    return (
      userEmail === normalizedIdentifier
      || userName === normalizedName
      || userNameCompact === normalizedNameCompact
      || emailLocalPart === normalizedIdentifier
      || userLooseName === normalizedLoose
      || userLooseEmailLocal === normalizedLoose
    )
  })
}

function findBestUserByIdentifier(users, identifier, password = '') {
  const normalizedIdentifier = normalizeIdentifierValue(identifier)
  if (!normalizedIdentifier) {
    return null
  }

  const normalizedPassword = String(password || '')
  const normalizedName = normalizeAccountName(identifier)
  const normalizedNameCompact = normalizeAccountNameCompact(identifier)
  const normalizedLoose = normalizeLooseIdentifier(identifier)

  const matches = (users || [])
    .map((user) => {
      const userEmail = normalizeIdentifierValue(user.email)
      const userName = normalizeAccountName(user.name)
      const userNameCompact = normalizeAccountNameCompact(user.name)
      const emailLocalPart = userEmail.split('@')[0] || ''
      const userLooseName = normalizeLooseIdentifier(user.name)
      const userLooseEmailLocal = normalizeLooseIdentifier(emailLocalPart)

      let score = 0
      if (userEmail === normalizedIdentifier) score = 100
      else if (userName === normalizedName) score = 90
      else if (userNameCompact === normalizedNameCompact) score = 85
      else if (emailLocalPart === normalizedIdentifier) score = 80
      else if (userLooseName === normalizedLoose) score = 60
      else if (userLooseEmailLocal === normalizedLoose) score = 55

      return score > 0 ? { user, score } : null
    })
    .filter(Boolean)

  if (!matches.length) {
    return null
  }

  const passwordMatch = matches.find(({ user }) => String(user.password || '') === normalizedPassword)
  if (passwordMatch) {
    return passwordMatch.user
  }

  matches.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score
    }

    return right.user.id - left.user.id
  })

  return matches[0].user
}

function mergeUsersByIdAndEmail(...userGroups) {
  const mergedById = new Map()
  const mergedByEmail = new Map()

  userGroups.flat().forEach((user) => {
    if (!user || !user.id) {
      return
    }

    const normalizedEmail = normalizeIdentifierValue(user.email)
    const existingById = mergedById.get(user.id)
    const existingByEmail = normalizedEmail ? mergedByEmail.get(normalizedEmail) : null
    const nextUser = existingById || existingByEmail || user

    const mergedUser = {
      ...nextUser,
      ...user,
      email: normalizedEmail || nextUser.email || '',
    }

    mergedById.set(user.id, mergedUser)

    if (normalizedEmail) {
      mergedByEmail.set(normalizedEmail, mergedUser)
    }
  })

  return Array.from(mergedById.values()).sort((left, right) => left.id - right.id)
}

function createUserRecord(users, profile = {}) {
  const normalizedEmail = profile.email?.trim().toLowerCase()
  const nextId = users.reduce((maxId, user) => Math.max(maxId, user.id), 0) + 1
  const preferredName = [profile.firstName, profile.lastName]
    .map((value) => value?.trim())
    .filter(Boolean)
    .join(' ')

  return {
    id: nextId,
    name: preferredName || profile.name?.trim() || normalizedEmail?.split('@')[0] || `user${nextId}`,
    email: normalizedEmail || '',
    password: profile.password || '',
    avatar:
      profile.avatar ||
      '',
    coverPhoto: profile.coverPhoto || '',
    totalVotes: 0,
    googleId: profile.googleId || null,
     gender: profile.gender || '',
  }
}

function mergeUsers(localUsers, remoteUsers) {
  return mergeUsersByIdAndEmail(localUsers, remoteUsers)
}

export default function App() {
  // Beginner-friendly state: we keep all dynamic UI data in React hooks.
  const [activeTab, setActiveTab] = useState(() => {
    const savedUserId = readSessionUserId()
    if (!savedUserId) return 'home'
    return localStorage.getItem(ACTIVE_TAB_KEY) || 'home'
  })
  const [users, setUsers] = useState(() => mergeUsersByIdAndEmail(readStoredUsers(USERS_KEY), readStoredUsers(ACCOUNT_STORE_KEY), usersData))
  const [posts, setPosts] = useState(() => normalizePosts(readStoredJson(POSTS_KEY, postsData)))
  const [stories, setStories] = useState(() => {
    const stored = readStoredJson(STORIES_KEY, null)
    if (!stored || !stored.length) return normalizeStories(initialStories)
    const now = Date.now()
    const hasActive = stored.some((s) => {
      const t = s.createdAt ? Date.parse(s.createdAt) : 0
      return now - t < 24 * 60 * 60 * 1000
    })
    return normalizeStories(hasActive ? stored : initialStories)
  })
  const [likedPosts, setLikedPosts] = useState([])
  const [votedPosts, setVotedPosts] = useState([])
  const [currentUserId, setCurrentUserId] = useState(readSessionUserId)
  const [messages, setMessages] = useState(() => readStoredJson(MESSAGES_KEY, messagesData))
  const [notifications, setNotifications] = useState(() => readStoredJson(NOTIFICATIONS_KEY, []))
  const [notificationsLastSeenAt, setNotificationsLastSeenAt] = useState(() => {
    const rawValue = Number(localStorage.getItem(NOTIFICATIONS_LAST_SEEN_AT_KEY))
    return Number.isFinite(rawValue) && rawValue > 0 ? rawValue : 0
  })
  const [homeLastSeenAt, setHomeLastSeenAt] = useState(() => {
    const rawValue = Number(localStorage.getItem(HOME_LAST_SEEN_AT_KEY))
    return Number.isFinite(rawValue) && rawValue > 0 ? rawValue : 0
  })
  const [challengesLastSeenAt, setChallengesLastSeenAt] = useState(() => {
    const rawValue = Number(localStorage.getItem(CHALLENGES_LAST_SEEN_AT_KEY))
    return Number.isFinite(rawValue) && rawValue > 0 ? rawValue : 0
  })
  const [messagesLastSeenId, setMessagesLastSeenId] = useState(() => {
    const rawValue = Number(localStorage.getItem(MESSAGES_LAST_SEEN_ID_KEY))
    return Number.isFinite(rawValue) && rawValue > 0 ? rawValue : 0
  })
  const [followGraph, setFollowGraph] = useState(() => readStoredRecord(FOLLOWING_KEY, {}))
  const [selectedChatUserId, setSelectedChatUserId] = useState(2)
  const [theme, setTheme] = useState(() => localStorage.getItem(THEME_KEY) || 'light')
  const [language, setLanguage] = useState(() => {
    const storedLanguage = localStorage.getItem(LANGUAGE_KEY) || 'en'
    return isSupportedLanguage(storedLanguage) ? storedLanguage : 'en'
  })
  const [challengeSearchQuery, setChallengeSearchQuery] = useState('')
  const [apiMode, setApiMode] = useState('probing')
  const [isRemoteReady, setIsRemoteReady] = useState(false)
  const [hasHydratedRemote, setHasHydratedRemote] = useState(false)
  const [initialLoadTimeout, setInitialLoadTimeout] = useState(false)
  const [viewingUserId, setViewingUserId] = useState(() => readSessionUserId() || null)
  const [openStoryComposerSignal, setOpenStoryComposerSignal] = useState(0)
  const [openChatThreadSignal, setOpenChatThreadSignal] = useState(0)

  const currentUser = users.find((user) => user.id === currentUserId) || null
  const t = createTranslator(language)
  const followingUserIds = currentUser
    ? (Array.isArray(followGraph[currentUser.id]) ? followGraph[currentUser.id] : [])
    : []
  const homePosts = posts.filter((post) => inferPostType(post) === POST_TYPE_HOME)
  const challengePosts = posts.filter((post) => inferPostType(post) === POST_TYPE_CHALLENGE)
  const incomingMessages = currentUser
    ? messages.filter((message) => message.toUserId === currentUser.id)
    : []
  const unreadMessageCount = incomingMessages.filter((message) => {
    const messageId = Number(message?.id)
    return Number.isFinite(messageId) && messageId > messagesLastSeenId
  }).length
  const unreadNotificationCount = notifications.filter((notification) => {
    const createdAtMs = Date.parse(String(notification?.createdAt || ''))
    return Number.isFinite(createdAtMs) && createdAtMs > notificationsLastSeenAt
  }).length
  const unreadHomeCount = currentUser
    ? homePosts.filter((post) => {
      if (post?.userId === currentUser.id) {
        return false
      }

      const createdAtMs = Date.parse(String(post?.createdAt || ''))
      return Number.isFinite(createdAtMs) && createdAtMs > homeLastSeenAt
    }).length
    : 0
  const unreadChallengesCount = currentUser
    ? challengePosts.filter((post) => {
      if (post?.userId === currentUser.id) {
        return false
      }

      const createdAtMs = Date.parse(String(post?.createdAt || ''))
      return Number.isFinite(createdAtMs) && createdAtMs > challengesLastSeenAt
    }).length
    : 0
  const navBadgeCounts = {
    home: unreadHomeCount,
    challenges: unreadChallengesCount,
    notifications: unreadNotificationCount,
    messages: unreadMessageCount,
  }

  useEffect(() => {
    document.body.classList.toggle('theme-dark', theme === 'dark')
    document.body.classList.toggle('theme-light', theme === 'light')
  }, [theme])

  useEffect(() => {
    document.documentElement.lang = language
    localStorage.setItem(LANGUAGE_KEY, language)
  }, [language])

  function applyRemoteState(remoteState) {
    setUsers((currentUsers) => mergeUsers(currentUsers, remoteState.users || []))
    setPosts(normalizePosts(Array.isArray(remoteState.posts) ? remoteState.posts : []))
    setStories(normalizeStories(Array.isArray(remoteState.stories) ? remoteState.stories : []))
    setMessages(Array.isArray(remoteState.messages) ? remoteState.messages : [])
    setApiMode('online')
    setHasHydratedRemote(true)
    setIsRemoteReady(true)
  }

  useEffect(() => {
    let isCancelled = false

    loadRemoteState()
      .then((remoteState) => {
        if (isCancelled) {
          return
        }
        applyRemoteState(remoteState)
      })
      .catch(() => {
        if (!isCancelled) {
          setApiMode('offline')
          setIsRemoteReady(true)
        }
      })

    return () => {
      isCancelled = true
    }
  }, [])

  useEffect(() => {
    if (apiMode !== 'offline') {
      return undefined
    }

    const retryTimer = window.setTimeout(() => {
      loadRemoteState()
        .then((remoteState) => {
          applyRemoteState(remoteState)
        })
        .catch(() => {})
    }, 6000)

    return () => {
      window.clearTimeout(retryTimer)
    }
  }, [apiMode])

  useEffect(() => {
    const loginTimeoutTimer = window.setTimeout(() => {
      if (!isRemoteReady) {
        setInitialLoadTimeout(true)
      }
    }, 5000)

    return () => {
      window.clearTimeout(loginTimeoutTimer)
    }
  }, [isRemoteReady])

  useEffect(() => {
    localStorage.setItem(USERS_KEY, JSON.stringify(users))
    localStorage.setItem(ACCOUNT_STORE_KEY, JSON.stringify(users))
    if (apiMode === 'online' && hasHydratedRemote) {
      syncRemoteUsers(users).catch(() => {})
    }
  }, [apiMode, hasHydratedRemote, users])

  useEffect(() => {
    localStorage.setItem(POSTS_KEY, JSON.stringify(posts))
    if (apiMode === 'online' && hasHydratedRemote) {
      syncRemotePosts(posts).catch(() => {})
    }
  }, [apiMode, hasHydratedRemote, posts])

  useEffect(() => {
    localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(notifications))
  }, [notifications])

  useEffect(() => {
    localStorage.setItem(NOTIFICATIONS_LAST_SEEN_AT_KEY, String(notificationsLastSeenAt))
  }, [notificationsLastSeenAt])

  useEffect(() => {
    localStorage.setItem(HOME_LAST_SEEN_AT_KEY, String(homeLastSeenAt))
  }, [homeLastSeenAt])

  useEffect(() => {
    localStorage.setItem(CHALLENGES_LAST_SEEN_AT_KEY, String(challengesLastSeenAt))
  }, [challengesLastSeenAt])

  useEffect(() => {
    localStorage.setItem(MESSAGES_LAST_SEEN_ID_KEY, String(messagesLastSeenId))
  }, [messagesLastSeenId])

  useEffect(() => {
    if (activeTab !== 'notifications') {
      return
    }

    setNotificationsLastSeenAt((currentValue) => {
      const nextValue = Date.now()
      return nextValue > currentValue ? nextValue : currentValue
    })
  }, [activeTab, notifications])

  useEffect(() => {
    if (activeTab !== 'home') {
      return
    }

    setHomeLastSeenAt((currentValue) => {
      const nextValue = Date.now()
      return nextValue > currentValue ? nextValue : currentValue
    })
  }, [activeTab, homePosts])

  useEffect(() => {
    if (activeTab !== 'challenges') {
      return
    }

    setChallengesLastSeenAt((currentValue) => {
      const nextValue = Date.now()
      return nextValue > currentValue ? nextValue : currentValue
    })
  }, [activeTab, challengePosts])

  useEffect(() => {
    if (activeTab !== 'messages' || !currentUser) {
      return
    }

    const maxIncomingMessageId = messages.reduce((currentMax, message) => {
      if (message?.toUserId !== currentUser.id) {
        return currentMax
      }

      const messageId = Number(message?.id)
      if (!Number.isFinite(messageId)) {
        return currentMax
      }

      return Math.max(currentMax, messageId)
    }, 0)

    setMessagesLastSeenId((currentValue) => Math.max(currentValue, maxIncomingMessageId))
  }, [activeTab, currentUser, messages])

  useEffect(() => {
    localStorage.setItem(FOLLOWING_KEY, JSON.stringify(followGraph))
  }, [followGraph])

  function appendNotifications(nextItems) {
    const items = Array.isArray(nextItems) ? nextItems : [nextItems]
    const validItems = items.filter(Boolean)
    if (!validItems.length) {
      return
    }

    setNotifications((currentItems) => [...validItems, ...currentItems].slice(0, 300))
  }

  useEffect(() => {
    localStorage.setItem(STORIES_KEY, JSON.stringify(stories))
    if (apiMode === 'online' && hasHydratedRemote) {
      syncRemoteStories(stories).catch(() => {})
    }
  }, [apiMode, hasHydratedRemote, stories])

  useEffect(() => {
    localStorage.setItem(MESSAGES_KEY, JSON.stringify(messages))
    if (apiMode === 'online' && hasHydratedRemote) {
      syncRemoteMessages(messages).catch(() => {})
    }
  }, [apiMode, hasHydratedRemote, messages])

  function handleTabChange(tab) {
    setActiveTab(tab)
    localStorage.setItem(ACTIVE_TAB_KEY, tab)
  }

  function handleToggleTheme() {
    setTheme((current) => {
      const nextTheme = current === 'dark' ? 'light' : 'dark'
      localStorage.setItem(THEME_KEY, nextTheme)
      return nextTheme
    })
  }

  function handleChangeLanguage(nextLanguage) {
    if (!isSupportedLanguage(nextLanguage)) {
      return
    }

    setLanguage(nextLanguage)
  }

  function handleSearchQueryChange(nextQuery) {
    setChallengeSearchQuery(String(nextQuery || '').trim())
  }

  function updatePost(postId, updater) {
    setPosts((currentPosts) =>
      currentPosts.map((post) => (post.id === postId ? updater(post) : post)),
    )
  }

  function handleLike(postId) {
    const targetPost = posts.find((post) => post.id === postId)
    const alreadyLiked = likedPosts.includes(postId)

    setLikedPosts((prev) =>
      alreadyLiked ? prev.filter((id) => id !== postId) : [...prev, postId],
    )

    updatePost(postId, (post) => ({
      ...post,
      likes: alreadyLiked ? Math.max(0, post.likes - 1) : post.likes + 1,
    }))

    if (!alreadyLiked && targetPost && targetPost.userId !== currentUser?.id) {
      appendNotifications({
        id: Date.now() + Math.random(),
        type: 'like',
        actorId: currentUser?.id,
        targetUserId: targetPost.userId,
        postId,
        challengeTitle: targetPost.challengeTitle || '',
        createdAt: new Date().toISOString(),
      })
    }
  }

  function handleComment(postId) {
    const targetPost = posts.find((post) => post.id === postId)
    updatePost(postId, (post) => ({ ...post, comments: post.comments + 1 }))

    if (targetPost && targetPost.userId !== currentUser?.id) {
      appendNotifications({
        id: Date.now() + Math.random(),
        type: 'comment',
        actorId: currentUser?.id,
        targetUserId: targetPost.userId,
        postId,
        challengeTitle: targetPost.challengeTitle || '',
        createdAt: new Date().toISOString(),
      })
    }
  }

  function handleShare(postId) {
    updatePost(postId, (post) => ({ ...post, shares: post.shares + 1 }))
  }

  function handleVote(postId) {
    if (votedPosts.includes(postId)) {
      return
    }

    setVotedPosts((prev) => [...prev, postId])

    let postOwnerId = null
    updatePost(postId, (post) => {
      postOwnerId = post.userId
      return { ...post, challengeVotes: post.challengeVotes + 1 }
    })

    // When a challenge gets a vote, increase that user's leaderboard score.
    if (postOwnerId) {
      setUsers((currentUsers) =>
        currentUsers.map((user) =>
          user.id === postOwnerId
            ? { ...user, totalVotes: user.totalVotes + 1 }
            : user,
        ),
      )

      if (postOwnerId !== currentUser?.id) {
        const targetPost = posts.find((post) => post.id === postId)
        appendNotifications({
          id: Date.now() + Math.random(),
          type: 'vote',
          actorId: currentUser?.id,
          targetUserId: postOwnerId,
          postId,
          challengeTitle: targetPost?.challengeTitle || '',
          createdAt: new Date().toISOString(),
        })
      }
    }
  }

  function handleLogin(identifier, password) {
    if (!isRemoteReady && !initialLoadTimeout) {
      return {
        ok: false,
        message: 'Checking saved accounts. Please wait a few seconds and try again.',
      }
    }

    const existingUser = findBestUserByIdentifier(users, identifier, password)
      || findBestUserByIdentifier(readStoredUsers(ACCOUNT_STORE_KEY), identifier, password)

    if (!existingUser) {
      return { ok: false, message: 'No account found with that email or account name. Please create one.' }
    }

    if (existingUser.password && existingUser.password !== password) {
      return { ok: false, message: 'Wrong account name/email or password.' }
    }

    if (!existingUser.password) {
      setUsers((currentUsers) =>
        currentUsers.map((user) =>
          user.id === existingUser.id ? { ...user, password } : user,
        ),
      )
    }

    setCurrentUserId(existingUser.id)
    setViewingUserId(existingUser.id)
    handleTabChange('user-profile')
    localStorage.setItem(SESSION_KEY, String(existingUser.id))
    return { ok: true }
  }

  function handleForgotPassword(identifier, nextPassword) {
    if (!isRemoteReady && !initialLoadTimeout) {
      return {
        ok: false,
        message: 'Checking saved accounts. Please wait a few seconds and try again.',
      }
    }

    const existingUser = findBestUserByIdentifier(users, identifier)
      || findBestUserByIdentifier(readStoredUsers(ACCOUNT_STORE_KEY), identifier)
    if (!existingUser) {
      return {
        ok: false,
        message: 'No account found with that email or account name. Please create one.',
      }
    }

    setUsers((currentUsers) =>
      currentUsers.map((user) =>
        user.id === existingUser.id
          ? { ...user, password: nextPassword }
          : user,
      ),
    )

    return {
      ok: true,
      message: 'Password updated. You can now log in with your account name/email and new password.',
    }
  }

  function handleRegister(profile) {
    const normalizedEmail = profile.email.trim().toLowerCase()
    const existingUser = users.find(
      (user) => user.email.toLowerCase() === normalizedEmail,
    )

    if (existingUser) {
      return { ok: false, message: 'An account with this email already exists. Please log in.' }
    }

    const newUser = createUserRecord(users, {
      ...profile,
      email: normalizedEmail,
    })
    setUsers((currentUsers) => [...currentUsers, newUser])
    localStorage.setItem(ACCOUNT_STORE_KEY, JSON.stringify([...users, newUser]))
    setCurrentUserId(newUser.id)
    setViewingUserId(newUser.id)
    handleTabChange('user-profile')
    localStorage.setItem(SESSION_KEY, String(newUser.id))
    return { ok: true }
  }

  function handleGoogleLogin(profile) {
    if (!profile?.email) {
      return { ok: false, message: 'Google profile is missing an email address.' }
    }

    const normalizedEmail = profile.email.trim().toLowerCase()
    const existingUser = users.find(
      (user) => user.email.toLowerCase() === normalizedEmail,
    )

    if (existingUser) {
      setUsers((currentUsers) =>
        currentUsers.map((user) => {
          if (user.id !== existingUser.id) {
            return user
          }

          return {
            ...user,
            name: profile.name?.trim() || user.name,
            avatar: profile.avatar || user.avatar,
            googleId: profile.googleId || user.googleId || null,
          }
        }),
      )

      setCurrentUserId(existingUser.id)
      setViewingUserId(existingUser.id)
      handleTabChange('profile')
      localStorage.setItem(SESSION_KEY, String(existingUser.id))
      return { ok: true }
    }

    const newUser = createUserRecord(users, profile)

    setUsers((currentUsers) => [...currentUsers, newUser])
    localStorage.setItem(ACCOUNT_STORE_KEY, JSON.stringify([...users, newUser]))
    setCurrentUserId(newUser.id)
    setViewingUserId(newUser.id)
    handleTabChange('user-profile')
    localStorage.setItem(SESSION_KEY, String(newUser.id))
    return { ok: true }
  }

  function handleLogout() {
    // Persist current in-memory data before ending the session to make re-login reliable.
    localStorage.setItem(USERS_KEY, JSON.stringify(users))
    localStorage.setItem(POSTS_KEY, JSON.stringify(posts))
    localStorage.setItem(STORIES_KEY, JSON.stringify(stories))
    localStorage.setItem(MESSAGES_KEY, JSON.stringify(messages))

    setCurrentUserId(null)
    handleTabChange('home')
    localStorage.removeItem(SESSION_KEY)
    localStorage.removeItem(ACTIVE_TAB_KEY)
  }

  function handleDeleteAccount() {
    if (!currentUser) {
      return
    }

    const accountId = currentUser.id
    setUsers((currentUsers) => currentUsers.filter((user) => user.id !== accountId))
    setPosts((currentPosts) => currentPosts.filter((post) => post.userId !== accountId))
    setStories((currentStories) => currentStories.filter((story) => story.userId !== accountId))
    setMessages((currentMessages) =>
      currentMessages.filter(
        (message) => message.fromUserId !== accountId && message.toUserId !== accountId,
      ),
    )

    setCurrentUserId(null)
    setViewingUserId(null)
    setSelectedChatUserId(2)
    handleTabChange('home')
    localStorage.removeItem(SESSION_KEY)
    localStorage.removeItem(ACTIVE_TAB_KEY)
  }

  function handleOpenChat(userId) {
    setSelectedChatUserId(userId)
    setOpenChatThreadSignal(Date.now())
    handleTabChange('messages')
  }

  function handleSendMessage(toUserId, text, replyMeta = null) {
    const safeReplyMeta = replyMeta && typeof replyMeta === 'object'
      ? {
          replyToMessageId: Number(replyMeta.replyToMessageId) || null,
          replyToSenderName: String(replyMeta.replyToSenderName || '').trim(),
          replyToText: String(replyMeta.replyToText || '').trim(),
        }
      : null

    setMessages((currentMessages) => [
      ...currentMessages,
      {
        id: currentMessages.reduce((maxId, message) => Math.max(maxId, message.id), 0) + 1,
        fromUserId: currentUser.id,
        toUserId,
        text,
        replyToMessageId: safeReplyMeta?.replyToMessageId || null,
        replyToSenderName: safeReplyMeta?.replyToSenderName || '',
        replyToText: safeReplyMeta?.replyToText || '',
        sentAt: new Date().toISOString(),
        timestamp: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
      },
    ])
  }

  function handleCreatePost({ text, mediaItems, mediaType, mediaUrl, challengeTitle, postType }) {
    const resolvedPostType = postType === POST_TYPE_CHALLENGE ? POST_TYPE_CHALLENGE : POST_TYPE_HOME
    const fallbackMediaItems = mediaUrl
      ? [{ type: mediaType || 'image', url: mediaUrl }]
      : []
    const sourceMediaItems = Array.isArray(mediaItems) && mediaItems.length > 0 ? mediaItems : fallbackMediaItems
    const cleanMediaItems = sourceMediaItems
      .map(({ type, url }) => ({ type, url }))
      .filter((item) => item.type && item.url)

    setPosts((currentPosts) => {
      const nextId = currentPosts.reduce((maxId, post) => Math.max(maxId, post.id), 0) + 1
      return [
        {
          id: nextId,
          userId: currentUser.id,
          timestamp: 'Just now',
          createdAt: new Date().toISOString(),
          text,
          mediaItems: cleanMediaItems,
          mediaType: cleanMediaItems.length > 0 ? cleanMediaItems[0].type : null,
          mediaUrl: cleanMediaItems.length > 0 ? cleanMediaItems[0].url : null,
          likes: 0,
          comments: 0,
          shares: 0,
          challengeVotes: 0,
          challengeTitle,
          postType: resolvedPostType,
        },
        ...currentPosts,
      ]
    })

    if (resolvedPostType === POST_TYPE_CHALLENGE && currentUser) {
      appendNotifications(
        users
          .filter((user) => user.id !== currentUser.id)
          .map((user) => ({
            id: Date.now() + Math.random() + user.id,
            type: 'new-challenge',
            actorId: currentUser.id,
            targetUserId: user.id,
            challengeTitle: challengeTitle || 'New Challenge',
            createdAt: new Date().toISOString(),
          })),
      )
    }
  }

  function handleCreateStory({ text, mediaItems, challengeTitle, musicUrl, musicName }) {
    const cleanMediaItems = mediaItems.map(({ id, type, url, isUploading }) => ({ type, url }))

    setStories((currentStories) => {
      const nextId = currentStories.reduce((maxId, story) => Math.max(maxId, story.id), 0) + 1
      const nextStoryBase = {
        id: nextId,
        userId: currentUser.id,
        timestamp: 'Just now',
        createdAt: new Date().toISOString(),
        text,
        mediaItems: cleanMediaItems,
        mediaType: cleanMediaItems.length > 0 ? cleanMediaItems[0].type : null,
        mediaUrl: cleanMediaItems.length > 0 ? cleanMediaItems[0].url : null,
        musicUrl: musicUrl || null,
        musicName: musicName || '',
        challengeTitle,
      }
      return [
        {
          ...nextStoryBase,
          ...getAutoStoryMusic(nextStoryBase),
        },
        ...currentStories,
      ]
    })
  }

  function handleEditPost(postId, nextValues) {
    const cleanMediaItems = (nextValues.mediaItems || []).map(({ id, type, url, isUploading }) => ({ type, url }))

    setPosts((currentPosts) =>
      currentPosts.map((post) =>
        post.id === postId && canEditPostWithinWindow(post)
          ? {
              ...post,
              text: nextValues.text,
              challengeTitle: nextValues.challengeTitle,
              mediaItems: cleanMediaItems,
              mediaType: cleanMediaItems.length > 0 ? cleanMediaItems[0].type : null,
              mediaUrl: cleanMediaItems.length > 0 ? cleanMediaItems[0].url : null,
              postType: nextValues.postType || post.postType || inferPostType(post),
            }
          : post,
      ),
    )
  }

  function handleDeletePost(postId) {
    setPosts((currentPosts) =>
      currentPosts.filter((post) => post.id !== postId || !canEditPostWithinWindow(post)),
    )
  }

  function handleEditStory(storyId, nextValues) {
    const cleanMediaItems = (nextValues.mediaItems || []).map(({ id, type, url, isUploading }) => ({ type, url }))

    setStories((currentStories) =>
      currentStories.map((story) =>
        story.id === storyId
          ? (() => {
              const nextStory = {
                ...story,
                text: nextValues.text,
                challengeTitle: nextValues.challengeTitle,
                mediaItems: cleanMediaItems,
                mediaType: cleanMediaItems.length > 0 ? cleanMediaItems[0].type : null,
                mediaUrl: cleanMediaItems.length > 0 ? cleanMediaItems[0].url : null,
                musicUrl: nextValues.musicUrl || null,
                musicName: nextValues.musicName || '',
              }

              return {
                ...nextStory,
                ...getAutoStoryMusic(nextStory),
              }
            })()
          : story,
      ),
    )
  }

  function handleDeleteStory(storyId) {
    setStories((currentStories) => currentStories.filter((story) => story.id !== storyId))
  }

  function handleStoryReaction({ storyId, storyOwnerId, reactionKey }) {
    if (!storyOwnerId || storyOwnerId === currentUser?.id) {
      return
    }

    appendNotifications({
      id: Date.now() + Math.random(),
      type: 'story-reaction',
      actorId: currentUser?.id,
      targetUserId: storyOwnerId,
      storyId,
      reactionKey,
      createdAt: new Date().toISOString(),
    })
  }

  function handleToggleFollowUser(targetUserId) {
    if (!currentUser || !targetUserId || targetUserId === currentUser.id) {
      return
    }

    setFollowGraph((current) => {
      const currentFollowing = Array.isArray(current[currentUser.id]) ? current[currentUser.id] : []
      const nextFollowing = currentFollowing.includes(targetUserId)
        ? currentFollowing.filter((id) => id !== targetUserId)
        : [...currentFollowing, targetUserId]

      return {
        ...current,
        [currentUser.id]: nextFollowing,
      }
    })
  }

  function handleEditMessage(messageId, nextText) {
    setMessages((currentMessages) =>
      currentMessages.map((message) =>
        message.id === messageId
          ? (() => {
              if (message.fromUserId !== currentUser?.id) {
                return message
              }

              const sentAtMs = Date.parse(String(message?.sentAt || ''))
              const canEdit = Number.isFinite(sentAtMs)
                && Date.now() - sentAtMs <= MESSAGE_EDIT_WINDOW_MS

              if (!canEdit) {
                return message
              }

              return { ...message, text: nextText }
            })()
          : message,
      ),
    )
  }

  function handleDeleteMessage(messageId) {
    setMessages((currentMessages) =>
      currentMessages.filter((message) => message.id !== messageId),
    )
  }

  function handleForwardMessage(toUserId, text) {
    if (!currentUser || !toUserId || !String(text || '').trim()) {
      return
    }

    setMessages((currentMessages) => [
      ...currentMessages,
      {
        id: currentMessages.reduce((maxId, message) => Math.max(maxId, message.id), 0) + 1,
        fromUserId: currentUser.id,
        toUserId,
        text: String(text).trim(),
        sentAt: new Date().toISOString(),
        timestamp: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
      },
    ])
  }

  function handleUpdateCurrentUserCoverPhoto(coverPhotoUrl) {
    if (!currentUserId) {
      return
    }

    setUsers((currentUsers) =>
      currentUsers.map((user) =>
        user.id === currentUserId ? { ...user, coverPhoto: coverPhotoUrl } : user,
      ),
    )
  }

  function handleUpdateCurrentUserAvatar(avatarUrl) {
    if (!currentUserId) {
      return
    }

    setUsers((currentUsers) =>
      currentUsers.map((user) =>
        user.id === currentUserId ? { ...user, avatar: avatarUrl } : user,
      ),
    )
  }

  function handleNavigateToUserProfile(userId) {
    setViewingUserId(userId)
    handleTabChange('user-profile')
  }

  function handleNavigateToMenu() {
    handleTabChange('menu')
  }

  function handleNavigateToSettings() {
    handleTabChange('settings')
  }

  function handleNavigateTab(tabName) {
    handleTabChange(tabName)
    setViewingUserId(null)
  }

  function handleOpenStoryComposerFromProfile() {
    setOpenStoryComposerSignal(Date.now())
    handleTabChange('home')
    setViewingUserId(null)
  }

  if (!currentUser && !isRemoteReady && !initialLoadTimeout) {
    return (
      <section className="login-page" aria-label="Preparing your account data">
        <div className="login-card">
          <h1 className="brand-heading brand-heading-inline">
            <img src="/avatars/challenger.png" alt="Challenger logo" className="brand-logo-img" />
            <span className="brand-word">Challenger</span>
          </h1>
          <p className="login-subtitle">Checking saved accounts...</p>
        </div>
      </section>
    )
  }

  if (!currentUser) {
    return (
      <LoginPage
        onLogin={handleLogin}
        onRegister={handleRegister}
        onGoogleLogin={handleGoogleLogin}
        onForgotPassword={handleForgotPassword}
        t={t}
      />
    )
  }

  return (
    <div className="app-shell">
      <TopNav
        currentUser={currentUser}
        activeTab={activeTab}
        onTabChange={handleTabChange}
        users={users}
        posts={posts}
        badgeCounts={navBadgeCounts}
        onNavigateToProfile={handleNavigateToUserProfile}
        onNavigateToMenu={handleNavigateToMenu}
        onSearchQueryChange={handleSearchQueryChange}
        t={t}
      />

      <main className="page-area">
        {activeTab === 'home' && (
          <HomePage
            currentUser={currentUser}
            users={users}
            posts={homePosts}
            challengePosts={challengePosts}
            followGraph={followGraph}
            stories={stories}
            likedPosts={likedPosts}
            votedPosts={votedPosts}
            onLike={handleLike}
            onComment={handleComment}
            onShare={handleShare}
            onVote={handleVote}
            onCreatePost={handleCreatePost}
            onCreateStory={handleCreateStory}
            onEditPost={handleEditPost}
            onDeletePost={handleDeletePost}
            onEditStory={handleEditStory}
            onDeleteStory={handleDeleteStory}
            onSendStoryMessage={handleSendMessage}
            onOpenChat={handleOpenChat}
            onTabChange={handleTabChange}
            onNavigateToProfile={handleNavigateToUserProfile}
            onToggleFollowUser={handleToggleFollowUser}
            openStoryComposerSignal={openStoryComposerSignal}
            onStoryReaction={handleStoryReaction}
            t={t}
          />
        )}

        {activeTab === 'challenges' && (
          <ChallengesPage
            currentUser={currentUser}
            users={users}
            posts={challengePosts}
            searchQuery={challengeSearchQuery}
            likedPosts={likedPosts}
            votedPosts={votedPosts}
            onLike={handleLike}
            onComment={handleComment}
            onShare={handleShare}
            onVote={handleVote}
            onCreatePost={handleCreatePost}
            onEditPost={handleEditPost}
            onDeletePost={handleDeletePost}
            onNavigateToProfile={handleNavigateToUserProfile}
            t={t}
          />
        )}

        {activeTab === 'people' && (
          <PeoplePage
            currentUser={currentUser}
            users={users}
            followGraph={followGraph}
            onToggleFollowUser={handleToggleFollowUser}
            onNavigateToProfile={handleNavigateToUserProfile}
            t={t}
          />
        )}

        {activeTab === 'notifications' && (
          <NotificationsPage
            currentUser={currentUser}
            users={users}
            posts={posts}
            messages={messages}
            notifications={notifications}
            onOpenChat={handleOpenChat}
            t={t}
          />
        )}
        {activeTab === 'messages' && (
          <MessagesPage
            currentUser={currentUser}
            users={users}
            messages={messages}
            selectedChatUserId={selectedChatUserId}
            openThreadSignal={openChatThreadSignal}
            onSelectChat={setSelectedChatUserId}
            onSendMessage={handleSendMessage}
            onEditMessage={handleEditMessage}
            onDeleteMessage={handleDeleteMessage}
            onForwardMessage={handleForwardMessage}
            onNavigateToProfile={handleNavigateToUserProfile}
            t={t}
          />
        )}
        {(activeTab === 'profile' || activeTab === 'user-profile') && (
          <UserProfilePage
            user={activeTab === 'profile' ? currentUser : users.find((u) => u.id === viewingUserId)}
            currentUserId={currentUserId}
            users={users}
            posts={posts}
            followGraph={followGraph}
            onNavigate={handleNavigateToSettings}
            onAddStory={handleOpenStoryComposerFromProfile}
            onTabChange={handleNavigateTab}
            onUpdateAvatar={handleUpdateCurrentUserAvatar}
            onUpdateCoverPhoto={handleUpdateCurrentUserCoverPhoto}
            t={t}
          />
        )}
        {activeTab === 'menu' && (
          <MenuPage
            onTabChange={handleNavigateTab}
            onNavigate={handleNavigateToSettings}
            theme={theme}
            onToggleTheme={handleToggleTheme}
            currentUser={currentUser}
            onLogout={handleLogout}
            onNavigateToLanguage={() => handleNavigateTab('language')}
            language={language}
            t={t}
          />
        )}
        {activeTab === 'settings' && (
          <SettingsPage
            currentUser={currentUser}
            onLogout={handleLogout}
            onDeleteAccount={handleDeleteAccount}
            t={t}
          />
        )}
        {activeTab === 'language' && (
          <LanguagePage language={language} onChangeLanguage={handleChangeLanguage} t={t} />
        )}
      </main>

      <BottomNav activeTab={activeTab} onTabChange={handleTabChange} badgeCounts={navBadgeCounts} t={t} />
    </div>
  )
}
