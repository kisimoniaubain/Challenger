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
const THEME_KEY = 'challenger_theme'
const USERS_KEY = 'challenger_users'
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

function createUserRecord(users, profile = {}) {
  const normalizedEmail = profile.email?.trim().toLowerCase()
  const nextId = users.reduce((maxId, user) => Math.max(maxId, user.id), 0) + 1

  return {
    id: nextId,
    name: profile.name?.trim() || normalizedEmail?.split('@')[0] || `user${nextId}`,
    email: normalizedEmail || '',
    password: profile.password || '',
    avatar:
      profile.avatar ||
      'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=200&q=80',
    coverPhoto: profile.coverPhoto || '',
    totalVotes: 0,
    googleId: profile.googleId || null,
  }
}

export default function App() {
  // Beginner-friendly state: we keep all dynamic UI data in React hooks.
  const [activeTab, setActiveTab] = useState('home')
  const [users, setUsers] = useState(() => readStoredJson(USERS_KEY, usersData))
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
  const [currentUserId, setCurrentUserId] = useState(null)
  const [messages, setMessages] = useState(() => readStoredJson(MESSAGES_KEY, messagesData))
  const [selectedChatUserId, setSelectedChatUserId] = useState(2)
  const [theme, setTheme] = useState(() => localStorage.getItem(THEME_KEY) || 'light')
  const [apiMode, setApiMode] = useState('probing')
  const [viewingUserId, setViewingUserId] = useState(null)

  const currentUser = users.find((user) => user.id === currentUserId) || null

  useEffect(() => {
    document.body.classList.toggle('theme-dark', theme === 'dark')
    document.body.classList.toggle('theme-light', theme === 'light')
  }, [theme])

  useEffect(() => {
    let isCancelled = false

    loadRemoteState()
      .then((remoteState) => {
        if (isCancelled) {
          return
        }

        if (remoteState.users.length) {
          setUsers(remoteState.users)
        }
        if (remoteState.posts.length) {
          setPosts(remoteState.posts)
        }
        if (remoteState.stories.length) {
          setStories(normalizeStories(remoteState.stories))
        }
        if (remoteState.messages.length) {
          setMessages(remoteState.messages)
        }

        setApiMode('online')
      })
      .catch(() => {
        if (!isCancelled) {
          setApiMode('offline')
        }
      })

    return () => {
      isCancelled = true
    }
  }, [])

  useEffect(() => {
    localStorage.setItem(USERS_KEY, JSON.stringify(users))
    if (apiMode === 'online') {
      syncRemoteUsers(users).catch(() => {})
    }
  }, [apiMode, users])

  useEffect(() => {
    localStorage.setItem(POSTS_KEY, JSON.stringify(posts))
    if (apiMode === 'online') {
      syncRemotePosts(posts).catch(() => {})
    }
  }, [apiMode, posts])

  useEffect(() => {
    localStorage.setItem(STORIES_KEY, JSON.stringify(stories))
    if (apiMode === 'online') {
      syncRemoteStories(stories).catch(() => {})
    }
  }, [apiMode, stories])

  useEffect(() => {
    localStorage.setItem(MESSAGES_KEY, JSON.stringify(messages))
    if (apiMode === 'online') {
      syncRemoteMessages(messages).catch(() => {})
    }
  }, [apiMode, messages])

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

  function handleLogin(email, password) {
    const normalizedEmail = email.trim().toLowerCase()
    const existingUser = users.find(
      (user) => user.email.toLowerCase() === normalizedEmail,
    )

    if (!existingUser) {
      return { ok: false, message: 'No account found for this email. Please create one.' }
    }

    if (existingUser.password && existingUser.password !== password) {
      return { ok: false, message: 'Wrong email or password.' }
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
    setActiveTab('user-profile')
    localStorage.setItem(SESSION_KEY, String(existingUser.id))
    return { ok: true }
  }

  function handleRegister(email, password) {
    const normalizedEmail = email.trim().toLowerCase()
    const existingUser = users.find(
      (user) => user.email.toLowerCase() === normalizedEmail,
    )

    if (existingUser) {
      return { ok: false, message: 'An account with this email already exists. Please log in.' }
    }

    const newUser = createUserRecord(users, { email: normalizedEmail, password })
    setUsers((currentUsers) => [...currentUsers, newUser])
    setCurrentUserId(newUser.id)
    setViewingUserId(newUser.id)
    setActiveTab('user-profile')
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
      setActiveTab('profile')
      localStorage.setItem(SESSION_KEY, String(existingUser.id))
      return { ok: true }
    }

    const newUser = createUserRecord(users, profile)

    setUsers((currentUsers) => [...currentUsers, newUser])
    setCurrentUserId(newUser.id)
    setViewingUserId(newUser.id)
    setActiveTab('user-profile')
    localStorage.setItem(SESSION_KEY, String(newUser.id))
    return { ok: true }
  }

  function handleLogout() {
    setCurrentUserId(null)
    setActiveTab('home')
    localStorage.removeItem(SESSION_KEY)
  }

  function handleOpenChat(userId) {
    setSelectedChatUserId(userId)
    setActiveTab('messages')
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
    setActiveTab('user-profile')
  }

  function handleNavigateToMenu() {
    setActiveTab('menu')
  }

  function handleNavigateToSettings() {
    setActiveTab('settings')
  }

  function handleNavigateTab(tabName) {
    setActiveTab(tabName)
    setViewingUserId(null)
  }

  if (!currentUser) {
    return (
      <LoginPage
        onLogin={handleLogin}
        onRegister={handleRegister}
        onGoogleLogin={handleGoogleLogin}
      />
    )
  }

  return (
    <div className="app-shell">
      <TopNav
        currentUser={currentUser}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        users={users}
        posts={posts}
        onNavigateToProfile={handleNavigateToUserProfile}
        onLogout={handleLogout}
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
            onTabChange={setActiveTab}
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
          />
        )}
        {activeTab === 'settings' && (
          <SettingsPage
            currentUser={currentUser}
            onLogout={handleLogout}
          />
        )}
      </main>

      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  )
}
