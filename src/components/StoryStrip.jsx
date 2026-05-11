import { useEffect, useMemo, useState } from 'react'

const STORY_DURATION_MS = 5000
const STORY_EXPIRY_MS = 24 * 60 * 60 * 1000
const STORY_REACTIONS = [
  { key: 'heart',   icon: 'fa-solid fa-heart',             color: '#e0245e' },
  { key: 'laugh',   icon: 'fa-solid fa-face-laugh-squint', color: '#f7b731' },
  { key: 'fire',    icon: 'fa-solid fa-fire',              color: '#fd7e14' },
  { key: 'wow',     icon: 'fa-solid fa-face-surprise',     color: '#f7b731' },
  { key: 'clap',    icon: 'fa-solid fa-hands-clapping',    color: '#20c997' },
]

export default function StoryStrip({
  stories,
  users,
  currentUserId,
  onCreateStory,
  onEditStory,
  onDeleteStory,
}) {
  const [activeGroupIndex, setActiveGroupIndex] = useState(null)
  const [activeStoryIndex, setActiveStoryIndex] = useState(null)
  const [activeUserStories, setActiveUserStories] = useState([])
  const [storyMessages, setStoryMessages] = useState({})
  const [messageDraft, setMessageDraft] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [reactionCounts, setReactionCounts] = useState({})
  const [elapsed, setElapsed] = useState(0)

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
      .slice(0, 12)
  }, [activeStories, users])

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

    setReactionCounts((current) => {
      const storyReactions = current[activeStory.id] || {}
      return {
        ...current,
        [activeStory.id]: {
          ...storyReactions,
          [key]: (storyReactions[key] || 0) + 1,
        },
      }
    })
  }

  return (
    <>
      <section className="stories-strip" aria-label="Active challenges">
      <div className="stories-row">
        {/* Create challenge card */}
        <div className="story-card story-card-create" role="button" tabIndex={0} onClick={onCreateStory} onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onCreateStory()
          }
        }}>
          <div className="story-card-bg story-card-create-bg">
            <i className="fa-solid fa-plus story-add-icon" aria-hidden="true" />
          </div>
          <p className="story-label">Create Story</p>
        </div>

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
                {group.latestStory.mediaType === 'video' && group.latestStory.mediaUrl ? (
                  <video className="story-card-video" src={group.latestStory.mediaUrl} muted playsInline />
                ) : (
                  <div
                    className="story-card-image"
                    style={
                      group.latestStory.mediaUrl
                        ? { backgroundImage: `url(${group.latestStory.mediaUrl})` }
                        : { background: 'linear-gradient(160deg, #1877f2 0%, #42a5f5 100%)' }
                    }
                  />
                )}
                <img
                  src={group.author?.avatar}
                  alt={group.author?.name}
                  className="story-ring-avatar"
                />
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

            <div className="story-viewer-head">
              <img
                src={activeAuthor?.avatar}
                alt={activeAuthor?.name}
                className="story-viewer-avatar"
              />
              <div>
                <strong>{activeAuthor?.name}</strong>
                <p>{activeStory.timestamp}</p>
              </div>
            </div>

            {activeStory.userId === currentUserId ? (
              <div className="story-owner-actions">
                <button type="button" onClick={() => onEditStory(activeStory)}>
                  <i className="fa-solid fa-pen" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onDeleteStory(activeStory.id)
                    const remainingStories = activeUserStories.filter((story) => story.id !== activeStory.id)
                    setActiveUserStories(remainingStories)
                    setActiveStoryIndex(remainingStories.length ? 0 : null)
                    if (!remainingStories.length) {
                      closeViewer()
                    }
                  }}
                >
                  <i className="fa-solid fa-trash" aria-hidden="true" />
                </button>
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
              <p className="story-viewer-title">{activeStory.challengeTitle}</p>

              {activeStory.musicUrl ? (
                <div className="story-music-bar">
                  <audio src={activeStory.musicUrl} controls className="story-music-player" />
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
                  >
                    <i className={r.icon} style={{ color: r.color }} aria-hidden="true" />
                    <span>{reactionCounts[activeStory.id]?.[r.key] || 0}</span>
                  </button>
                ))}
              </div>

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
