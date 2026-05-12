import { useEffect, useState } from 'react'
import TopNav from './components/TopNav'
import BottomNav from './components/BottomNav'
import HomePage from './pages/HomePage'
import ChallengesPage from './pages/ChallengesPage'
import NotificationsPage from './pages/NotificationsPage'
import MessagesPage from './pages/MessagesPage'
import ProfilePage from './pages/ProfilePage'
import UserProfilePage from './pages/UserProfilePage'
import MenuPage from './pages/MenuPage'
import SettingsPage from './pages/SettingsPage'
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

const SESSION_KEY = 'challenger_session_user_id'
const ACTIVE_TAB_KEY = 'challenger_active_tab'
const THEME_KEY = 'challenger_theme'
const USERS_KEY = 'challenger_users'
const ACCOUNT_STORE_KEY = 'challenger_account_store'
const POSTS_KEY = 'challenger_posts'
const STORIES_KEY = 'challenger_stories'
const MESSAGES_KEY = 'challenger_messages'

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
    musicUrl: story.musicUrl || null,
    musicName: story.musicName || '',
  }))
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
  const [posts, setPosts] = useState(() => readStoredJson(POSTS_KEY, postsData))
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
  const [selectedChatUserId, setSelectedChatUserId] = useState(2)
  const [theme, setTheme] = useState(() => localStorage.getItem(THEME_KEY) || 'light')
  const [apiMode, setApiMode] = useState('probing')
  const [isRemoteReady, setIsRemoteReady] = useState(false)
  const [hasHydratedRemote, setHasHydratedRemote] = useState(false)
  const [initialLoadTimeout, setInitialLoadTimeout] = useState(false)
  const [viewingUserId, setViewingUserId] = useState(() => readSessionUserId() || null)

  const currentUser = users.find((user) => user.id === currentUserId) || null

  useEffect(() => {
    document.body.classList.toggle('theme-dark', theme === 'dark')
    document.body.classList.toggle('theme-light', theme === 'light')
  }, [theme])

  function applyRemoteState(remoteState) {
    setUsers((currentUsers) => mergeUsers(currentUsers, remoteState.users || []))
    setPosts(Array.isArray(remoteState.posts) ? remoteState.posts : [])
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

  function updatePost(postId, updater) {
    setPosts((currentPosts) =>
      currentPosts.map((post) => (post.id === postId ? updater(post) : post)),
    )
  }

  function handleLike(postId) {
    const alreadyLiked = likedPosts.includes(postId)

    setLikedPosts((prev) =>
      alreadyLiked ? prev.filter((id) => id !== postId) : [...prev, postId],
    )

    updatePost(postId, (post) => ({
      ...post,
      likes: alreadyLiked ? Math.max(0, post.likes - 1) : post.likes + 1,
    }))
  }

  function handleComment(postId) {
    updatePost(postId, (post) => ({ ...post, comments: post.comments + 1 }))
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
    handleTabChange('messages')
  }

  function handleSendMessage(toUserId, text) {
    setMessages((currentMessages) => [
      ...currentMessages,
      {
        id: currentMessages.reduce((maxId, message) => Math.max(maxId, message.id), 0) + 1,
        fromUserId: currentUser.id,
        toUserId,
        text,
        timestamp: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
      },
    ])
  }

  function handleCreatePost({ text, mediaType, mediaUrl, challengeTitle }) {
    setPosts((currentPosts) => {
      const nextId = currentPosts.reduce((maxId, post) => Math.max(maxId, post.id), 0) + 1
      return [
        {
          id: nextId,
          userId: currentUser.id,
          timestamp: 'Just now',
          text,
          mediaType,
          mediaUrl,
          likes: 0,
          comments: 0,
          shares: 0,
          challengeVotes: 0,
          challengeTitle,
        },
        ...currentPosts,
      ]
    })
  }

  function handleCreateStory({ text, mediaType, mediaUrl, challengeTitle, musicUrl, musicName }) {
    setStories((currentStories) => {
      const nextId = currentStories.reduce((maxId, story) => Math.max(maxId, story.id), 0) + 1
      return [
        {
          id: nextId,
          userId: currentUser.id,
          timestamp: 'Just now',
          createdAt: new Date().toISOString(),
          text,
          mediaType,
          mediaUrl,
          musicUrl: musicUrl || null,
          musicName: musicName || '',
          challengeTitle,
        },
        ...currentStories,
      ]
    })
  }

  function handleEditPost(postId, nextValues) {
    setPosts((currentPosts) =>
      currentPosts.map((post) =>
        post.id === postId
          ? {
              ...post,
              text: nextValues.text,
              challengeTitle: nextValues.challengeTitle,
              mediaType: nextValues.mediaType,
              mediaUrl: nextValues.mediaUrl,
            }
          : post,
      ),
    )
  }

  function handleDeletePost(postId) {
    setPosts((currentPosts) => currentPosts.filter((post) => post.id !== postId))
  }

  function handleEditStory(storyId, nextValues) {
    setStories((currentStories) =>
      currentStories.map((story) =>
        story.id === storyId
          ? {
              ...story,
              text: nextValues.text,
              challengeTitle: nextValues.challengeTitle,
              mediaType: nextValues.mediaType,
              mediaUrl: nextValues.mediaUrl,
              musicUrl: nextValues.musicUrl || null,
              musicName: nextValues.musicName || '',
            }
          : story,
      ),
    )
  }

  function handleDeleteStory(storyId) {
    setStories((currentStories) => currentStories.filter((story) => story.id !== storyId))
  }

  function handleEditMessage(messageId, nextText) {
    setMessages((currentMessages) =>
      currentMessages.map((message) =>
        message.id === messageId ? { ...message, text: nextText } : message,
      ),
    )
  }

  function handleDeleteMessage(messageId) {
    setMessages((currentMessages) =>
      currentMessages.filter((message) => message.id !== messageId),
    )
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

  if (!currentUser && !isRemoteReady && !initialLoadTimeout) {
    return (
      <section className="login-page" aria-label="Preparing your account data">
        <div className="login-card">
          <h1 className="brand-heading brand-heading-inline">
            <span className="brand-mark" aria-hidden="true">C</span>
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
        onNavigateToProfile={handleNavigateToUserProfile}
        onNavigateToMenu={handleNavigateToMenu}
      />

      <main className="page-area">
        {activeTab === 'home' && (
          <HomePage
            currentUser={currentUser}
            users={users}
            posts={posts}
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
            onOpenChat={handleOpenChat}
            onTabChange={handleTabChange}
            onNavigateToProfile={handleNavigateToUserProfile}
          />
        )}

        {activeTab === 'challenges' && (
          <ChallengesPage
            currentUser={currentUser}
            users={users}
            posts={posts}
            votedPosts={votedPosts}
            onVote={handleVote}
            onCreatePost={handleCreatePost}
            onNavigateToProfile={handleNavigateToUserProfile}
          />
        )}

        {activeTab === 'notifications' && (
          <NotificationsPage currentUser={currentUser} users={users} posts={posts} messages={messages} />
        )}
        {activeTab === 'messages' && (
          <MessagesPage
            currentUser={currentUser}
            users={users}
            messages={messages}
            selectedChatUserId={selectedChatUserId}
            onSelectChat={setSelectedChatUserId}
            onSendMessage={handleSendMessage}
            onEditMessage={handleEditMessage}
            onDeleteMessage={handleDeleteMessage}
            onNavigateToProfile={handleNavigateToUserProfile}
          />
        )}
        {activeTab === 'profile' && (
          <ProfilePage
            currentUser={currentUser}
            posts={posts}
            onNavigate={handleNavigateToSettings}
            onUpdateAvatar={handleUpdateCurrentUserAvatar}
            onUpdateCoverPhoto={handleUpdateCurrentUserCoverPhoto}
          />
        )}
        {activeTab === 'user-profile' && viewingUserId && (
          <UserProfilePage
            user={users.find((u) => u.id === viewingUserId)}
            currentUserId={currentUserId}
            users={users}
            posts={posts}
            onNavigate={handleNavigateToSettings}
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
          />
        )}
        {activeTab === 'settings' && (
          <SettingsPage
            currentUser={currentUser}
            onLogout={handleLogout}
            onDeleteAccount={handleDeleteAccount}
          />
        )}
      </main>

      <BottomNav activeTab={activeTab} onTabChange={handleTabChange} />
    </div>
  )
}
