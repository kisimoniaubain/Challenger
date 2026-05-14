import { useEffect, useMemo, useRef, useState } from 'react'
import { getAvatar } from '../utils/avatar'

const STORY_DURATION_MS = 5000
const STORY_EXPIRY_MS = 24 * 60 * 60 * 1000
const STORY_REACTIONS = [
  { key: 'heart',   icon: 'fa-solid fa-heart',             color: '#e0245e' },
  { key: 'laugh',   icon: 'fa-solid fa-face-laugh-squint', color: '#f7b731' },
  { key: 'fire',    icon: 'fa-solid fa-fire',              color: '#fd7e14' },
  { key: 'wow',     icon: 'fa-solid fa-face-surprise',     color: '#f7b731' },
  { key: 'clap',    icon: 'fa-solid fa-hands-clapping',    color: '#20c997' },
]

function formatRelativeStoryTime(createdAt) {
  const createdAtMs = Date.parse(createdAt || '')
  if (!Number.isFinite(createdAtMs)) {
    return 'Just now'
  }

  const diffMs = Math.max(0, Date.now() - createdAtMs)
  const diffMinutes = Math.floor(diffMs / 60000)

  if (diffMinutes < 1) {
    return 'Just now'
  }

  if (diffMinutes < 60) {
    return `${diffMinutes}m`
  }

  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) {
    return `${diffHours}h`
  }

  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) {
    return `${diffDays}d`
  }

  const diffWeeks = Math.floor(diffDays / 7)
  if (diffWeeks < 5) {
    return `${diffWeeks}w`
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: diffDays >= 365 ? 'numeric' : undefined,
  }).format(createdAtMs)
}

export default function StoryStrip({
  stories,
  users,
  currentUserId,
  onCreateStory,
  onCreateStoryFromCamera,
  onEditStory,
  onDeleteStory,
  onSendStoryMessage,
  onNavigateToProfile,
  onStoryReaction,
}) {
  const [activeGroupIndex, setActiveGroupIndex] = useState(null)
  const [activeStoryIndex, setActiveStoryIndex] = useState(null)
  const [activeUserStories, setActiveUserStories] = useState([])
  const [storyMessages, setStoryMessages] = useState({})
  const [messageDraft, setMessageDraft] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [storyReactions, setStoryReactions] = useState({})
  const [elapsed, setElapsed] = useState(0)
  const [relativeStoryTime, setRelativeStoryTime] = useState('Just now')
  const cameraCaptureInputRef = useRef(null)
  const createCardCameraInputRef = useRef(null)
  const storyMusicAudioRef = useRef(null)

  const activeStories = useMemo(() => {
    const now = Date.now()
    return stories
      .filter((story) => {
        const createdAt = story.createdAt ? Date.parse(story.createdAt) : Date.now()
        if (!Number.isFinite(createdAt)) {
          return true
        }
        return now - createdAt < STORY_EXPIRY_MS
      })
      .sort((a, b) => {
        const aTime = Date.parse(a.createdAt || '') || 0
        const bTime = Date.parse(b.createdAt || '') || 0
        return bTime - aTime
      })
  }, [stories])

  const userStoryGroups = useMemo(() => {
    const map = new Map()

    activeStories.forEach((story) => {
      if (!map.has(story.userId)) {
        map.set(story.userId, [])
      }
      map.get(story.userId).push(story)
    })

    return Array.from(map.entries())
      .map(([userId, userStories]) => {
        const author = users.find((u) => u.id === userId)
        return {
          userId,
          author,
          latestStory: userStories[0],
          stories: userStories,
        }
      })
      .sort((leftGroup, rightGroup) => {
        if (leftGroup.userId === currentUserId && rightGroup.userId !== currentUserId) {
          return -1
        }
        if (rightGroup.userId === currentUserId && leftGroup.userId !== currentUserId) {
          return 1
        }

        const leftTime = Date.parse(leftGroup.latestStory?.createdAt || '') || 0
        const rightTime = Date.parse(rightGroup.latestStory?.createdAt || '') || 0
        return rightTime - leftTime
      })
      .slice(0, 12)
  }, [activeStories, currentUserId, users])

  const activeStory = activeStoryIndex !== null ? activeUserStories[activeStoryIndex] : null
  const activeAuthor = activeStory ? users.find((user) => user.id === activeStory.userId) : null

  const hasPreviousStory = activeGroupIndex !== null && (
    activeStoryIndex > 0 || activeGroupIndex > 0
  )
  const hasNextStory = activeGroupIndex !== null && (
    activeStoryIndex < activeUserStories.length - 1 || activeGroupIndex < userStoryGroups.length - 1
  )

  function closeViewer() {
    setActiveGroupIndex(null)
    setActiveStoryIndex(null)
    setActiveUserStories([])
    setMessageDraft('')
  }

  useEffect(() => {
    if (activeStoryIndex === null || !activeStory) {
      return undefined
    }

    setRelativeStoryTime(formatRelativeStoryTime(activeStory.createdAt))
    const timeTimer = window.setInterval(() => {
      setRelativeStoryTime(formatRelativeStoryTime(activeStory.createdAt))
    }, 60000)

    return () => window.clearInterval(timeTimer)
  }, [activeStory?.createdAt, activeStory?.id])

  useEffect(() => {
    if (!activeStory?.musicUrl || activeStoryIndex === null) {
      return
    }

    const audioElement = storyMusicAudioRef.current
    if (!audioElement) {
      return
    }

    audioElement.currentTime = 0
    const playAttempt = audioElement.play()
    if (playAttempt && typeof playAttempt.catch === 'function') {
      playAttempt.catch(() => {})
    }
  }, [activeStory?.id, activeStory?.musicUrl, activeStoryIndex])

  useEffect(() => {
    if (activeStoryIndex === null) {
      return undefined
    }

    setElapsed(0)
    const tick = setInterval(() => {
      if (isTyping) return
      setElapsed((currentElapsed) => {
        const nextElapsed = currentElapsed + 100
        if (nextElapsed >= STORY_DURATION_MS) {
          showNextStory()
          return 0
        }
        return nextElapsed
      })
    }, 100)

    return () => clearInterval(tick)
  }, [activeStoryIndex, activeUserStories.length, activeGroupIndex, userStoryGroups.length, isTyping])

  useEffect(() => {
    function handleKeyDown(event) {
      if (activeStoryIndex === null) {
        return
      }

      if (event.key === 'Escape') {
        closeViewer()
      } else if (event.key === 'ArrowRight') {
        showNextStory()
      } else if (event.key === 'ArrowLeft') {
        showPrevStory()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeStoryIndex, activeUserStories.length, activeGroupIndex, userStoryGroups.length])

  function openStory(userStories, groupIndex) {
    setElapsed(0)
    setMessageDraft('')
    setActiveGroupIndex(groupIndex)
    setActiveUserStories(userStories)
    setActiveStoryIndex(0)
  }

  function showNextStory() {
    if (activeGroupIndex === null || activeStoryIndex === null) {
      return
    }

    setElapsed(0)

    if (activeStoryIndex < activeUserStories.length - 1) {
      setActiveStoryIndex((currentIndex) => (currentIndex === null ? null : currentIndex + 1))
      return
    }

    const nextGroup = userStoryGroups[activeGroupIndex + 1]
    if (!nextGroup) {
      closeViewer()
      return
    }

    setActiveGroupIndex(activeGroupIndex + 1)
    setActiveUserStories(nextGroup.stories)
    setActiveStoryIndex(0)
    setMessageDraft('')
  }

  function showPrevStory() {
    if (activeGroupIndex === null || activeStoryIndex === null) {
      return
    }

    setElapsed(0)

    if (activeStoryIndex > 0) {
      setActiveStoryIndex((currentIndex) => (currentIndex === null ? null : currentIndex - 1))
      return
    }

    const prevGroup = userStoryGroups[activeGroupIndex - 1]
    if (!prevGroup) {
      return
    }

    setActiveGroupIndex(activeGroupIndex - 1)
    setActiveUserStories(prevGroup.stories)
    setActiveStoryIndex(Math.max(0, prevGroup.stories.length - 1))
    setMessageDraft('')
  }

  function handleSendStoryMessage() {
    if (!activeStory || !messageDraft.trim()) {
      return
    }

    if (activeStory.userId !== currentUserId) {
      onSendStoryMessage?.(activeStory.userId, messageDraft.trim())
    }

    setStoryMessages((current) => {
      const currentItems = current[activeStory.id] || []
      return {
        ...current,
        [activeStory.id]: [...currentItems, { text: messageDraft.trim(), createdAt: Date.now() }],
      }
    })

    setMessageDraft('')
  }

  function handleReactionClick(key) {
    if (!activeStory) {
      return
    }

    setStoryReactions((current) => {
      const existingReactions = current[activeStory.id] || []
      const otherUsers = existingReactions.filter((item) => item.userId !== currentUserId)
      return {
        ...current,
        [activeStory.id]: [
          ...otherUsers,
          {
            userId: currentUserId,
            reactionKey: key,
            createdAt: Date.now(),
          },
        ],
      }
    })

    onStoryReaction?.({
      storyId: activeStory.id,
      storyOwnerId: activeStory.userId,
      reactionKey: key,
    })
  }

  const activeStoryReactionEntries = activeStory ? (storyReactions[activeStory.id] || []) : []

  return (
    <>
      <section className="stories-strip" aria-label="Active challenges">
      <div className="stories-row">
        {/* Create challenge card with user profile background */}
        {users && users.length > 0 && (
          <div
            className="story-card story-card-create"
            role="button"
            tabIndex={0}
            onClick={onCreateStory}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                onCreateStory()
              }
            }}
          >
            <div className="story-card-bg story-card-create-bg">
              <img
                src={getAvatar(users.find(u => u.id === currentUserId))}
                alt="Your profile"
                className="story-profile-cover"
              />
              <button
                type="button"
                className="story-create-camera-btn"
                aria-label="Capture story photo"
                onClick={(event) => {
                  event.stopPropagation()
                  createCardCameraInputRef.current?.click()
                }}
              >
                <i className="fa-solid fa-camera" aria-hidden="true" />
              </button>
              <input
                ref={createCardCameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="story-camera-capture-input"
                onChange={(event) => {
                  const capturedFile = event.target.files?.[0]
                  if (capturedFile && onCreateStoryFromCamera) {
                    onCreateStoryFromCamera(capturedFile)
                  }
                  if (event.target) {
                    event.target.value = ''
                  }
                }}
              />
              <div className="story-create-overlay">
                <div className="story-create-content">
                  <i className="fa-solid fa-plus story-add-icon" aria-hidden="true" />
                  <p className="story-create-text">Create a story</p>
                </div>
              </div>
            </div>
            <p className="story-label">Your Story</p>
          </div>
        )}

        {userStoryGroups.map((group, groupIndex) => {
          return (
            <article
              key={group.userId}
              className="story-card"
              onClick={() => openStory(group.stories, groupIndex)}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  openStory(group.stories, groupIndex)
                }
              }}
            >
              <div className="story-card-bg">
                <div
                  className="story-card-bg"
                  style={{
                    backgroundImage: `url(${getAvatar(group.author)})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    filter: 'blur(8px)',
                  }}
                  aria-hidden="true"
                />
                {group.latestStory.mediaType === 'video' ? (
                  <video className="story-card-video" src={group.latestStory.mediaUrl} muted playsInline />
                ) : (
                  <div
                    className="story-card-image"
                    style={
                      group.latestStory.mediaUrl
                        ? { backgroundImage: `url(${group.latestStory.mediaUrl})` }
                        : { background: 'transparent' }
                    }
                  />
                )}
                <div
                  className="story-card-header"
                  onClick={(e) => {
                    e.stopPropagation()
                    onNavigateToProfile && onNavigateToProfile(group.author?.id)
                  }}
                  role="button"
                  tabIndex={-1}
                >
                  <img
                    src={getAvatar(group.author)}
                    alt={group.author?.name}
                    className="story-card-header-avatar"
                  />
                  <div className="story-card-header-info">
                    <p className="story-card-header-name">{group.author?.name}</p>
                    <p className="story-card-header-small">{formatRelativeStoryTime(group.latestStory.createdAt)}</p>
                  </div>
                </div>
                {group.stories.length > 1 ? (
                  <span className="story-count-badge">+{group.stories.length - 1}</span>
                ) : null}
              </div>
              <p className="story-label">{group.author?.name}</p>
            </article>
          )
        })}
      </div>
      </section>

      {activeStory && (
        <div className="story-viewer-backdrop" role="dialog" aria-modal="true">
          <div className="story-viewer">
            <div className="story-progress-row" aria-hidden="true">
              {activeUserStories.map((story, index) => {
                let width = '0%'
                if (index < activeStoryIndex) width = '100%'
                if (index === activeStoryIndex) {
                  width = `${Math.min(100, Math.round((elapsed / STORY_DURATION_MS) * 100))}%`
                }

                return (
                  <div key={story.id} className="story-progress-track">
                    <span className="story-progress-fill" style={{ width }} />
                  </div>
                )
              })}
            </div>

            <button
              type="button"
              className="story-close-btn"
              onClick={closeViewer}
              aria-label="Close story"
            >
              <i className="fa-solid fa-xmark" aria-hidden="true" />
            </button>

            <div
              className="story-viewer-head"
              onClick={() => onNavigateToProfile && onNavigateToProfile(activeAuthor?.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  onNavigateToProfile && onNavigateToProfile(activeAuthor?.id)
                }
              }}
            >
              <img
                src={getAvatar(activeAuthor)}
                alt={activeAuthor?.name}
                className="story-viewer-avatar"
              />
              <div>
                <strong>{activeAuthor?.name}</strong>
                <p>{relativeStoryTime}</p>
              </div>
            </div>

            {activeStory.userId === currentUserId ? (
              <div className="story-owner-actions">
                <button
                  type="button"
                  aria-label="Add another story"
                  title="Add another story"
                  onClick={() => onCreateStory?.()}
                >
                  <i className="fa-solid fa-plus" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  aria-label="Capture story photo"
                  title="Capture story photo"
                  onClick={() => cameraCaptureInputRef.current?.click()}
                >
                  <i className="fa-solid fa-camera" aria-hidden="true" />
                </button>

                <input
                  ref={(element) => {
                    cameraCaptureInputRef.current = element
                  }}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="story-camera-capture-input"
                  onChange={(event) => {
                    const capturedFile = event.target.files?.[0]
                    if (capturedFile && onCreateStoryFromCamera) {
                      onCreateStoryFromCamera(capturedFile)
                    } else if (capturedFile) {
                      onCreateStory?.()
                    }
                    if (event.target) {
                      event.target.value = ''
                    }
                  }}
                />
              </div>
            ) : null}

            <div
              className="story-viewer-media"
            >
              <button
                type="button"
                className="story-tap-zone story-tap-prev"
                aria-label="Previous story"
                onClick={showPrevStory}
                disabled={!hasPreviousStory}
              />

              <button
                type="button"
                className="story-tap-zone story-tap-next"
                aria-label="Next story"
                onClick={showNextStory}
                disabled={!hasNextStory}
              />

              {activeStory.mediaType === 'video' && activeStory.mediaUrl ? (
                <video
                  className="story-viewer-video"
                  src={activeStory.mediaUrl}
                  autoPlay
                  controls
                  muted
                  playsInline
                />
              ) : (
                <div
                  className="story-viewer-image"
                  style={
                    activeStory.mediaUrl
                      ? { backgroundImage: `url(${activeStory.mediaUrl})` }
                      : { background: 'linear-gradient(160deg, #1877f2 0%, #42a5f5 100%)' }
                  }
                />
              )}

              {activeStory.musicUrl ? (
                <div className="story-music-bar">
                  <audio
                    key={`${activeStory.id}-${activeStory.musicUrl}`}
                    ref={storyMusicAudioRef}
                    src={activeStory.musicUrl}
                    autoPlay
                    controls
                    className="story-music-player"
                  />
                  <span className="story-music-label">{activeStory.musicName || 'Story music'}</span>
                </div>
              ) : null}

              <div className="story-reaction-row">
                {STORY_REACTIONS.map((r) => (
                  <button
                    key={r.key}
                    type="button"
                    className="story-reaction-btn"
                    onClick={() => handleReactionClick(r.key)}
                    aria-label={`React with ${r.key}`}
                  >
                    <i className={r.icon} style={{ color: r.color }} aria-hidden="true" />
                  </button>
                ))}
              </div>

              {activeStory.userId === currentUserId && activeStoryReactionEntries.length ? (
                <div className="story-reaction-summary" aria-label="Story reactions">
                  {activeStoryReactionEntries.map((entry) => {
                    const reactingUser = users.find((user) => user.id === entry.userId)
                    const reactionMeta = STORY_REACTIONS.find((reaction) => reaction.key === entry.reactionKey)

                    return (
                      <button
                        key={`${entry.userId}-${entry.reactionKey}`}
                        type="button"
                        className="story-reaction-summary-item"
                        onClick={() => reactingUser?.id && onNavigateToProfile?.(reactingUser.id)}
                        aria-label={`Open ${reactingUser?.name || 'user'} profile`}
                      >
                        <img
                          src={getAvatar(reactingUser)}
                          alt={reactingUser?.name}
                          className="story-reaction-summary-avatar"
                        />
                        <span className="story-reaction-summary-name">{reactingUser?.name || 'Someone'}</span>
                        <i
                          className={reactionMeta?.icon || 'fa-solid fa-heart'}
                          style={{ color: reactionMeta?.color || '#fff' }}
                          aria-hidden="true"
                        />
                      </button>
                    )
                  })}
                </div>
              ) : null}

              <div className="story-message-bar">
                <input
                  type="text"
                  placeholder="Send a message..."
                  value={messageDraft}
                  onChange={(event) => setMessageDraft(event.target.value)}
                  onFocus={() => setIsTyping(true)}
                  onBlur={() => setIsTyping(false)}
                />
                <button type="button" onClick={handleSendStoryMessage}>
                  Send
                </button>
              </div>

              {storyMessages[activeStory.id]?.length ? (
                <p className="story-last-message">{storyMessages[activeStory.id].at(-1)?.text}</p>
              ) : null}
            </div>

            <button
              type="button"
              className="story-nav-btn story-nav-prev"
              aria-label="Previous story"
              onClick={showPrevStory}
              disabled={!hasPreviousStory}
            >
              <i className="fa-solid fa-chevron-left" aria-hidden="true" />
            </button>

            <button
              type="button"
              className="story-nav-btn story-nav-next"
              aria-label="Next story"
              onClick={showNextStory}
              disabled={!hasNextStory}
            >
              <i className="fa-solid fa-chevron-right" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </>
  )
}
