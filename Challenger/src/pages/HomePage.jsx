import { useEffect, useRef, useState } from 'react'
import StoryStrip from '../components/StoryStrip'
import { getAvatar } from '../utils/avatar'
import PostCard from '../components/PostCard'
import { uploadMediaFile } from '../services/api'

const sideLinks = [
  { id: 'challenges', label: 'Challenges', icon: 'fa-solid fa-microphone-lines' },
  { id: 'notifications', label: 'Notifications', icon: 'fa-solid fa-bell' },
  { id: 'messages', label: 'Messages', icon: 'fa-solid fa-comments' },
  { id: 'profile', label: 'My Profile', icon: 'fa-solid fa-user' },
]

const STORY_MUSIC_CATEGORIES = [
  {
    key: 'trending',
    label: 'Trending',
    tracks: [
      { id: 'trend-1', name: 'Viral Pop Pulse', artist: 'Ava Hart', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3' },
      { id: 'trend-2', name: 'Sunset City Lights', artist: 'Milo Rivers', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3' },
      { id: 'trend-3', name: 'Midnight Storyline', artist: 'Zara Bloom', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3' },
    ],
  },
  {
    key: 'afrobeat',
    label: 'Afrobeat',
    tracks: [
      { id: 'afro-1', name: 'Lagos Vibe', artist: 'Kofi Blaze', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3' },
      { id: 'afro-2', name: 'Dance in Nairobi', artist: 'Nia Star', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3' },
      { id: 'afro-3', name: 'Drumline Heat', artist: 'Tempo King', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3' },
    ],
  },
  {
    key: 'gospel',
    label: 'Gospel',
    tracks: [
      { id: 'gospel-1', name: 'Grace Anthem', artist: 'Mercy Choir', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-7.mp3' },
      { id: 'gospel-2', name: 'Faith Rising', artist: 'Rehema Voice', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3' },
      { id: 'gospel-3', name: 'Morning Praise', artist: 'Hope Collective', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-9.mp3' },
    ],
  },
  {
    key: 'hiphop',
    label: 'Hip-Hop',
    tracks: [
      { id: 'hiphop-1', name: 'Street Story', artist: 'Jay Knox', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-10.mp3' },
      { id: 'hiphop-2', name: 'No Limits', artist: 'Rico Verse', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-11.mp3' },
      { id: 'hiphop-3', name: 'Late Night Bars', artist: 'Kali Rhymes', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-12.mp3' },
    ],
  },
]

export default function HomePage({
  currentUser,
  users,
  posts,
  challengePosts,
  followGraph,
  stories,
  likedPosts,
  votedPosts,
  onLike,
  onComment,
  onShare,
  onVote,
  onCreatePost,
  onCreateStory,
  onEditPost,
  onDeletePost,
  onEditStory,
  onDeleteStory,
  onSendStoryMessage,
  onOpenChat,
  onTabChange,
  onNavigateToProfile,
  onToggleFollowUser,
  openStoryComposerSignal,
  onStoryReaction,
  t,
}) {
  const tx = t || ((value) => value)
  const [composerOpen, setComposerOpen] = useState(false)
  const [composerMode, setComposerMode] = useState('post')
  const [editingTarget, setEditingTarget] = useState(null)
  const [challengeTitle, setChallengeTitle] = useState('')
  const [text, setText] = useState('')
  const [mediaItems, setMediaItems] = useState([])
  const [musicUrl, setMusicUrl] = useState(null)
  const [musicName, setMusicName] = useState('')
  const [isMediaUploading, setIsMediaUploading] = useState(false)
  const [isMusicUploading, setIsMusicUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [activeMusicCategory, setActiveMusicCategory] = useState(STORY_MUSIC_CATEGORIES[0].key)
  const mediaPreviewBlobUrlsRef = useRef({})
  const musicPreviewBlobUrlRef = useRef(null)
  const composerMusicInputRef = useRef(null)
  const quickComposerMediaInputRef = useRef(null)

  const followingIds = Array.isArray(followGraph?.[currentUser.id]) ? followGraph[currentUser.id] : []
  const followableUsers = (users || []).filter((user) => user.id !== currentUser.id)
  const allPosts = [...(posts || []), ...(challengePosts || [])]
  const scoredPeople = followableUsers
    .map((user) => {
      const candidateFollowing = Array.isArray(followGraph?.[user.id]) ? followGraph[user.id] : []
      const mutualCount = candidateFollowing.filter((id) => followingIds.includes(id)).length
      const followersCount = followableUsers.filter(
        (otherUser) => Array.isArray(followGraph?.[otherUser.id]) && followGraph[otherUser.id].includes(user.id),
      ).length
      const authoredCount = allPosts.filter((post) => post.userId === user.id).length
      const alreadyFollowingPenalty = followingIds.includes(user.id) ? 200 : 0
      const score = (mutualCount * 100) + (followersCount * 12) + (authoredCount * 5) + Number(user.totalVotes || 0) - alreadyFollowingPenalty

      return {
        user,
        mutualCount,
        followersCount,
        authoredCount,
        score,
      }
    })
    .sort((left, right) => right.score - left.score)

  const topPeopleToFollow = scoredPeople.slice(0, 4)
  const morePeopleToFollow = scoredPeople.slice(4, 8)

  function clearMediaPreviewBlobUrls() {
    Object.values(mediaPreviewBlobUrlsRef.current).forEach((url) => {
      URL.revokeObjectURL(url)
    })
    mediaPreviewBlobUrlsRef.current = {}
  }

  function clearMusicPreviewBlobUrl() {
    if (musicPreviewBlobUrlRef.current) {
      URL.revokeObjectURL(musicPreviewBlobUrlRef.current)
      musicPreviewBlobUrlRef.current = null
    }
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result || ''))
      reader.onerror = () => reject(new Error('Unable to read selected file.'))
      reader.readAsDataURL(file)
    })
  }

  useEffect(() => {
    return () => {
      clearMediaPreviewBlobUrls()
      clearMusicPreviewBlobUrl()
    }
  }, [])

  useEffect(() => {
    if (!openStoryComposerSignal) {
      return
    }

    openComposer('story')
  }, [openStoryComposerSignal])

  function openComposer(mode) {
    resetComposerFields()
    setComposerMode(mode)
    setEditingTarget(null)
    setUploadError('')
    setComposerOpen(true)
  }

  function openPostEditor(post) {
    setComposerMode('post')
    setEditingTarget({ kind: 'post', id: post.id })
    setChallengeTitle(post.challengeTitle || '')
    setText(post.text || '')
    const postMediaItems = (post.mediaItems || []).map((item) => ({
      id: Date.now() + Math.random(),
      type: item.type,
      url: item.url,
      isUploading: false,
    }))
    setMediaItems(postMediaItems)
    setMusicUrl(null)
    setMusicName('')
    setUploadError('')
    setComposerOpen(true)
  }

  function openStoryEditor(story) {
    setComposerMode('story')
    setEditingTarget({ kind: 'story', id: story.id })
    setChallengeTitle(story.challengeTitle || '')
    setText(story.text || '')
    const storyMediaItems = (story.mediaItems || []).map((item) => ({
      id: Date.now() + Math.random(),
      type: item.type,
      url: item.url,
      isUploading: false,
    }))
    setMediaItems(storyMediaItems)
    setMusicUrl(story.musicUrl || null)
    setMusicName(story.musicName || '')
    setUploadError('')
    setComposerOpen(true)
  }

  function resetComposerFields() {
    clearMediaPreviewBlobUrls()
    clearMusicPreviewBlobUrl()
    setEditingTarget(null)
    setChallengeTitle('')
    setText('')
    setMediaItems([])
    setMusicUrl(null)
    setMusicName('')
    setIsMediaUploading(false)
    setIsMusicUploading(false)
    setActiveMusicCategory(STORY_MUSIC_CATEGORIES[0].key)
    setUploadError('')
  }

  function closeComposer() {
    resetComposerFields()
    setComposerOpen(false)
  }

  function handleSelectSuggestedMusic(track) {
    if (!track?.url) {
      return
    }

    clearMusicPreviewBlobUrl()
    setMusicUrl(track.url)
    setMusicName(track.name)
    setUploadError('')
  }

  function handleMusicFromBrowser() {
    const browserUrl = window.prompt('Paste audio URL from browser (mp3/wav/ogg):', musicUrl || '')
    if (!browserUrl || !browserUrl.trim()) {
      return
    }

    const nextUrl = browserUrl.trim()
    if (!/^https?:\/\//i.test(nextUrl)) {
      setUploadError('Please enter a valid browser audio URL starting with http:// or https://')
      return
    }

    const fileName = decodeURIComponent(nextUrl.split('/').pop()?.split('?')[0] || 'Browser audio')
    clearMusicPreviewBlobUrl()
    setMusicUrl(nextUrl)
    setMusicName(fileName)
    setUploadError('')
  }

  function addSelectedMediaFiles(files) {
    if (!files || files.length === 0) {
      return
    }

    setIsMediaUploading(true)
    const newItems = []
    let uploadedCount = 0
    const totalFiles = files.length

    Array.from(files).forEach((file) => {
      const mediaType = file.type.startsWith('video/') ? 'video' : 'image'
      const previewBlobUrl = URL.createObjectURL(file)
      const tempId = Date.now() + Math.random()

      mediaPreviewBlobUrlsRef.current[tempId] = previewBlobUrl
      newItems.push({
        id: tempId,
        type: mediaType,
        url: previewBlobUrl,
        isUploading: true,
      })

      function markUploadComplete() {
        uploadedCount += 1
        if (uploadedCount === totalFiles) {
          setIsMediaUploading(false)
        }
      }

      uploadMediaFile(file)
        .then((uploadResult) => {
          setMediaItems((current) =>
            current.map((item) =>
              item.id === tempId
                ? { ...item, url: uploadResult.url, isUploading: false }
                : item,
            ),
          )
          markUploadComplete()
        })
        .catch((uploadError) => {
          readFileAsDataUrl(file)
            .then((localDataUrl) => {
              setMediaItems((current) =>
                current.map((item) =>
                  item.id === tempId
                    ? { ...item, url: localDataUrl, isUploading: false }
                    : item,
                ),
              )
              setUploadError('Media saved locally. Start backend/server to sync this media across devices.')
              markUploadComplete()
            })
            .catch((readError) => {
              setMediaItems((current) => current.filter((item) => item.id !== tempId))
              setUploadError('Media upload failed. Please try another file.')
              markUploadComplete()
            })
        })
    })

    setMediaItems((current) => [...current, ...newItems])
    setUploadError('')
  }

  function handleMediaChange(event) {
    addSelectedMediaFiles(event.target.files)
    event.target.value = ''
  }

  function handleQuickComposerMediaClick() {
    openComposer('post')
    setTimeout(() => {
      quickComposerMediaInputRef.current?.click()
    }, 0)
  }

  function handleQuickComposerMediaSelection(event) {
    const files = event.target.files
    if (!files || files.length === 0) {
      return
    }

    openComposer('post')
    addSelectedMediaFiles(files)
    event.target.value = ''
  }

  function removeMediaItem(itemId) {
    if (mediaPreviewBlobUrlsRef.current[itemId]) {
      URL.revokeObjectURL(mediaPreviewBlobUrlsRef.current[itemId])
      delete mediaPreviewBlobUrlsRef.current[itemId]
    }
    setMediaItems((current) => current.filter((item) => item.id !== itemId))
  }

  function handleCreateStoryFromCamera(file) {
    if (!file) {
      openComposer('story')
      return
    }

    setComposerMode('story')
    setEditingTarget(null)
    setChallengeTitle('')
    setText('')
    setMediaItems([])
    setMusicUrl(null)
    setMusicName('')
    setUploadError('')
    setComposerOpen(true)

    const nextMediaType = file.type.startsWith('video/') ? 'video' : 'image'
    const previewBlobUrl = URL.createObjectURL(file)
    clearMediaPreviewBlobUrls()
    const tempId = Date.now()
    mediaPreviewBlobUrlsRef.current[tempId] = previewBlobUrl
    setMediaItems([{ id: tempId, type: nextMediaType, url: previewBlobUrl, isUploading: true }])
    setIsMediaUploading(true)

    uploadMediaFile(file)
      .then((uploadResult) => {
        clearMediaPreviewBlobUrls()
        setMediaItems([{ id: tempId, type: nextMediaType, url: uploadResult.url, isUploading: false }])
        setIsMediaUploading(false)
        setUploadError('')
      })
      .catch((uploadError) => {
        readFileAsDataUrl(file)
          .then((localDataUrl) => {
            clearMediaPreviewBlobUrls()
            setMediaItems([{ id: tempId, type: nextMediaType, url: localDataUrl, isUploading: false }])
            setIsMediaUploading(false)
            setUploadError('Photo saved locally. Start backend/server to sync this media across devices.')
          })
          .catch((readError) => {
            clearMediaPreviewBlobUrls()
            setMediaItems([])
            setIsMediaUploading(false)
            setUploadError('Camera photo upload failed. Please try again.')
          })
      })
  }

  function handleMusicChange(event) {
    const file = event.target.files?.[0]
    if (!file) {
      clearMusicPreviewBlobUrl()
      setMusicUrl(null)
      setMusicName('')
      setIsMusicUploading(false)
      setUploadError('')
      return
    }

    const previewBlobUrl = URL.createObjectURL(file)
    clearMusicPreviewBlobUrl()
    musicPreviewBlobUrlRef.current = previewBlobUrl
    setMusicUrl(previewBlobUrl)
    setMusicName(file.name)
    setUploadError('')
    setIsMusicUploading(true)

    uploadMediaFile(file)
      .then((uploadResult) => {
        clearMusicPreviewBlobUrl()
        setMusicUrl(uploadResult.url)
        setMusicName(file.name)
        setIsMusicUploading(false)
        setUploadError('')
      })
      .catch((uploadError) => {
        readFileAsDataUrl(file)
          .then((localDataUrl) => {
            clearMusicPreviewBlobUrl()
            setMusicUrl(localDataUrl)
            setMusicName(file.name)
            setIsMusicUploading(false)
            setUploadError('Music saved locally. Start backend/server to sync this media across devices.')
          })
          .catch((readError) => {
            clearMusicPreviewBlobUrl()
            setMusicUrl(null)
            setMusicName('')
            setIsMusicUploading(false)
            setUploadError('Music upload failed. Please try another file.')
          })
      })
  }

  function handleComposerSubmit(event) {
    event.preventDefault()
    if (isMediaUploading || isMusicUploading) {
      setUploadError('Please wait for uploads to finish before sharing.')
      return
    }

    if (mediaItems.some((item) => item.url.startsWith('blob:')) || (musicUrl && musicUrl.startsWith('blob:'))) {
      setUploadError('Upload is not finished. Retry upload so your story/post is saved on all devices.')
      return
    }

    const nextTitle = composerMode === 'story'
      ? (challengeTitle.trim() || 'New Story')
      : ''
    const nextText = composerMode === 'story' ? '' : text.trim()

    if (!nextText && mediaItems.length === 0) {
      return
    }

    const payload = {
      challengeTitle: nextTitle,
      text: nextText,
      mediaItems,
      musicUrl: composerMode === 'story' ? musicUrl : null,
      musicName: composerMode === 'story' ? musicName : '',
      postType: 'home',
    }

    if (editingTarget?.kind === 'post') {
      onEditPost(editingTarget.id, payload)
    } else if (editingTarget?.kind === 'story') {
      onEditStory(editingTarget.id, payload)
    } else if (composerMode === 'story') {
      onCreateStory(payload)
    } else {
      onCreatePost(payload)
    }

    // Clean up blob references
    mediaItems.forEach((item) => {
      if (item.url.startsWith('blob:') && mediaPreviewBlobUrlsRef.current[item.id]) {
        mediaPreviewBlobUrlsRef.current[item.id] = null
      }
    })
    if (musicUrl && musicPreviewBlobUrlRef.current === musicUrl) {
      musicPreviewBlobUrlRef.current = null
    }

    resetComposerFields()
    setComposerOpen(false)
    setUploadError('')
  }

  return (
    <div className="fb-layout">

      {/* ── Left sidebar ── */}
      <aside className="fb-left" aria-label="Left sidebar">
        <button
          type="button"
          className="fb-side-user"
          onClick={() => onTabChange('profile')}
        >
          <img src={getAvatar(currentUser)} alt={currentUser.name} className="fb-side-user-avatar" />
          <span>{currentUser.name}</span>
        </button>

        <nav className="fb-side-nav" aria-label="Shortcuts">
          {sideLinks.map((item) => (
            <button
              key={item.id}
              type="button"
              className="fb-side-item"
              onClick={() => onTabChange(item.id)}
            >
              <i className={`fb-side-icon ${item.icon}`} aria-hidden="true" />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <p className="fb-side-footer">
          <span className="brand-inline">
            <img src="/avatars/challenger.png" alt="Challenger logo" className="brand-logo-img" />
            <span className="brand-word">Challenger</span>
          </span>
          {' '}
          &middot; 2026
        </p>
      </aside>

      {/* ── Center feed ── */}
      <main className="fb-feed">
        {/* Composer */}
        <div className="fb-composer">
          <button
            type="button"
            className="fb-composer-avatar-btn"
            onClick={() => onNavigateToProfile?.(currentUser.id)}
            aria-label="Open your profile"
          >
            <img src={getAvatar(currentUser)} alt={currentUser.name} className="fb-composer-avatar" />
          </button>
          <button type="button" className="fb-composer-pill" onClick={() => openComposer('post')}>
            What's on your mind today?
          </button>
          <button
            type="button"
            className="fb-composer-media-btn"
            onClick={handleQuickComposerMediaClick}
            title="Post image or video"
            aria-label="Post image or video"
          >
            <i className="fa-solid fa-image" aria-hidden="true" />
          </button>
          <input
            ref={quickComposerMediaInputRef}
            type="file"
            accept="image/*,video/*"
            multiple
            className="composer-quick-media-input"
            onChange={handleQuickComposerMediaSelection}
          />
        </div>

        {/* Stories */}
        <div className="stories-head">
          <h3 className="stories-title">{tx('Stories')}</h3>
        </div>
        <StoryStrip
          users={users}
          stories={stories}
          currentUserId={currentUser.id}
          onCreateStory={() => openComposer('story')}
          onCreateStoryFromCamera={handleCreateStoryFromCamera}
          onEditStory={openStoryEditor}
          onDeleteStory={onDeleteStory}
          onSendStoryMessage={onSendStoryMessage}
          onNavigateToProfile={onNavigateToProfile}
          onStoryReaction={onStoryReaction}
        />

        {/* Posts */}
        <div className="feed-list" role="feed">
          {posts.map((post) => {
            const author = users.find((u) => u.id === post.userId)
            return (
              <PostCard
                key={post.id}
                post={post}
                author={author}
                currentUser={currentUser}
                isOwner={post.userId === currentUser.id}
                hasLiked={likedPosts.includes(post.id)}
                hasVoted={votedPosts.includes(post.id)}
                onLike={() => onLike(post.id)}
                onComment={() => onComment(post.id)}
                onShare={() => onShare(post.id)}
                onVote={() => onVote(post.id)}
                onEdit={() => openPostEditor(post)}
                onDelete={() => onDeletePost(post.id)}
                onNavigateToProfile={onNavigateToProfile}
              />
            )
          })}
        </div>
      </main>

      {/* ── Right sidebar ── */}
      <aside className="fb-right" aria-label="Right sidebar">
        {/* People to follow */}
        <div className="fb-widget">
          <h4 className="fb-widget-title">Suggested for You</h4>
          {topPeopleToFollow.map((person, i) => {
            const user = person.user
            const isFollowing = followingIds.includes(user.id)
            return (
              <article key={user.id} className="fb-contact-row fb-follow-row">
                <button type="button" className="fb-contact-main-btn" onClick={() => onNavigateToProfile?.(user.id)}>
                  <span className="fb-contact-rank">#{i + 1}</span>
                  <img src={getAvatar(user)} alt={user.name} className="fb-contact-avatar" />
                  <div className="fb-contact-info">
                    <strong>{user.name}</strong>
                    <p>{person.mutualCount} mutual · {person.followersCount} followers</p>
                  </div>
                </button>
                <button
                  type="button"
                  className={`people-follow-btn ${isFollowing ? 'is-following' : ''}`}
                  onClick={() => onToggleFollowUser?.(user.id)}
                >
                  {isFollowing ? tx('Following') : tx('Follow')}
                </button>
              </article>
            )
          })}
        </div>

        {/* More people */}
        <div className="fb-widget">
          <h4 className="fb-widget-title">People You May Know</h4>
          {morePeopleToFollow.length > 0 ? morePeopleToFollow.map((person) => {
            const user = person.user
            const isFollowing = followingIds.includes(user.id)
            return (
              <article key={user.id} className="fb-contact-row fb-follow-row">
                <button
                  type="button"
                  className="fb-contact-main-btn"
                  onClick={() => onNavigateToProfile?.(user.id)}
                >
                  <img src={getAvatar(user)} alt={user?.name} className="fb-contact-avatar" />
                  <div className="fb-contact-info">
                    <strong>{user.name}</strong>
                    <p>{person.authoredCount} posts · {person.followersCount} followers</p>
                  </div>
                </button>
                <button
                  type="button"
                  className={`people-follow-btn ${isFollowing ? 'is-following' : ''}`}
                  onClick={() => onToggleFollowUser?.(user.id)}
                >
                  {isFollowing ? tx('Following') : tx('Follow')}
                </button>
              </article>
            )
          }) : (
            <p className="top-search-empty">No more people to show.</p>
          )}
        </div>
      </aside>

      {composerOpen && (
        <div className="composer-modal-backdrop" role="dialog" aria-modal="true">
          <div className="composer-modal">
            <div className="composer-modal-head">
              <div>
                <h3>{composerMode === 'story' ? 'Create New Story' : 'Create Post'}</h3>
                <p>
                  {editingTarget
                    ? 'Update your content and save the changes.'
                    : 'Share text, a poster image, or a video.'}
                </p>
              </div>
              <button type="button" className="composer-close-btn" onClick={closeComposer}>
                <i className="fa-solid fa-xmark" aria-hidden="true" />
              </button>
            </div>

            <form className="composer-form" onSubmit={handleComposerSubmit}>
              {composerMode !== 'story' ? (
                <>
                  <label>
                    Caption
                    <textarea
                      value={text}
                      onChange={(event) => setText(event.target.value)}
                      placeholder="Write what's on your mind today"
                      rows={5}
                    />
                  </label>
                </>
              ) : null}

              <label>
                Upload image or video (select multiple)
                <input type="file" accept="image/*,video/*" onChange={handleMediaChange} multiple />
              </label>

              {mediaItems.length > 0 && (
                <div className="composer-media-gallery">
                  {mediaItems.map((item) => (
                    <div key={item.id} className="composer-media-item">
                      {item.type === 'video' ? (
                        <video src={item.url} className="composer-media-preview" />
                      ) : (
                        <img src={item.url} alt="Upload preview" className="composer-media-preview" />
                      )}
                      {item.isUploading && (
                        <div className="composer-media-uploading">
                          <i className="fa-solid fa-spinner fa-spin" aria-hidden="true" />
                        </div>
                      )}
                      <button
                        type="button"
                        className="composer-media-remove-btn"
                        onClick={() => removeMediaItem(item.id)}
                        aria-label="Remove this media"
                        title="Remove"
                      >
                        <i className="fa-solid fa-xmark" aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {composerMode === 'story' ? (
                <div className="composer-music-picker">
                  <label>Music</label>

                  <div className="story-music-categories" role="tablist" aria-label="Music categories">
                    {STORY_MUSIC_CATEGORIES.map((category) => (
                      <button
                        key={category.key}
                        type="button"
                        role="tab"
                        aria-selected={activeMusicCategory === category.key}
                        className={`story-music-category-btn ${activeMusicCategory === category.key ? 'is-active' : ''}`}
                        onClick={() => setActiveMusicCategory(category.key)}
                      >
                        {category.label}
                      </button>
                    ))}
                  </div>

                  <div className="story-music-upload-actions">
                    <button
                      type="button"
                      className="story-music-upload-btn"
                      onClick={() => composerMusicInputRef.current?.click()}
                      disabled={isMusicUploading}
                    >
                      <i className={`fa-solid ${isMusicUploading ? 'fa-spinner fa-spin' : 'fa-file-audio'}`} aria-hidden="true" />
                      {isMusicUploading ? 'Uploading...' : 'From Device'}
                    </button>

                    <button
                      type="button"
                      className="story-music-upload-btn"
                      onClick={handleMusicFromBrowser}
                    >
                      <i className="fa-solid fa-globe" aria-hidden="true" />
                      From Browser
                    </button>
                  </div>

                  <input
                    ref={composerMusicInputRef}
                    type="file"
                    accept="audio/*"
                    className="story-music-file-input"
                    onChange={handleMusicChange}
                  />

                  <p className="story-music-section-label">Tracks</p>

                  <div className="story-music-track-list">
                    {(STORY_MUSIC_CATEGORIES.find((category) => category.key === activeMusicCategory)?.tracks || []).map((track) => (
                      <button
                        key={track.id}
                        type="button"
                        className="story-music-track-btn"
                        onClick={() => handleSelectSuggestedMusic(track)}
                      >
                        <i className="fa-solid fa-music" aria-hidden="true" />
                        <span>
                          <strong>{track.name}</strong>
                          <small>{track.artist}</small>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {composerMode === 'story' && musicUrl ? (
                <div className="composer-preview">
                  <audio src={musicUrl} controls className="composer-preview-audio" />
                  <p className="composer-audio-label">Music: {musicName || 'Selected audio'}</p>
                </div>
              ) : null}

              {uploadError ? <p className="composer-upload-error">{uploadError}</p> : null}

              <div className="composer-actions">
                <button type="button" className="composer-secondary-btn" onClick={closeComposer}>
                  Cancel
                </button>
                <button type="submit" className="composer-primary-btn" disabled={isMediaUploading || isMusicUploading}>
                  {editingTarget
                    ? 'Save Changes'
                    : composerMode === 'story'
                      ? 'Share Story'
                      : 'Post'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
