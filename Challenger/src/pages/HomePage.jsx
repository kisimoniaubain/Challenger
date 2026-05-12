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

export default function HomePage({
  currentUser,
  users,
  posts,
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
  onOpenChat,
  onTabChange,
  onNavigateToProfile,
}) {
  const [composerOpen, setComposerOpen] = useState(false)
  const [composerMode, setComposerMode] = useState('post')
  const [editingTarget, setEditingTarget] = useState(null)
  const [challengeTitle, setChallengeTitle] = useState('')
  const [text, setText] = useState('')
  const [mediaType, setMediaType] = useState(null)
  const [mediaUrl, setMediaUrl] = useState(null)
  const [musicUrl, setMusicUrl] = useState(null)
  const [musicName, setMusicName] = useState('')
  const [isMediaUploading, setIsMediaUploading] = useState(false)
  const [isMusicUploading, setIsMusicUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const previewBlobUrlRef = useRef(null)
  const musicPreviewBlobUrlRef = useRef(null)

  const topChallengers = [...users].sort((a, b) => b.totalVotes - a.totalVotes).slice(0, 4)

  function clearPreviewBlobUrl() {
    if (previewBlobUrlRef.current) {
      URL.revokeObjectURL(previewBlobUrlRef.current)
      previewBlobUrlRef.current = null
    }
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
      clearPreviewBlobUrl()
      clearMusicPreviewBlobUrl()
    }
  }, [])

  function openComposer(mode) {
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
    setMediaType(post.mediaType || null)
    setMediaUrl(post.mediaUrl || null)
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
    setMediaType(story.mediaType || null)
    setMediaUrl(story.mediaUrl || null)
    setMusicUrl(story.musicUrl || null)
    setMusicName(story.musicName || '')
    setUploadError('')
    setComposerOpen(true)
  }

  function closeComposer() {
    clearPreviewBlobUrl()
    clearMusicPreviewBlobUrl()
    setComposerOpen(false)
    setEditingTarget(null)
    setChallengeTitle('')
    setText('')
    setMediaType(null)
    setMediaUrl(null)
    setMusicUrl(null)
    setMusicName('')
    setIsMediaUploading(false)
    setIsMusicUploading(false)
    setUploadError('')
  }

  function handleMediaChange(event) {
    const file = event.target.files?.[0]
    if (!file) {
      clearPreviewBlobUrl()
      setMediaType(null)
      setMediaUrl(null)
      setIsMediaUploading(false)
      setUploadError('')
      return
    }

    const nextMediaType = file.type.startsWith('video/') ? 'video' : 'image'
    const previewBlobUrl = URL.createObjectURL(file)
    clearPreviewBlobUrl()
    previewBlobUrlRef.current = previewBlobUrl
    setMediaType(nextMediaType)
    setMediaUrl(previewBlobUrl)
    setUploadError('')
    setIsMediaUploading(true)

    uploadMediaFile(file)
      .then((uploadResult) => {
        clearPreviewBlobUrl()
        setMediaUrl(uploadResult.url)
        setMediaType(nextMediaType)
        setIsMediaUploading(false)
        setUploadError('')
      })
      .catch(() => {
        setIsMediaUploading(false)
        readFileAsDataUrl(file)
          .then((localDataUrl) => {
            clearPreviewBlobUrl()
            setMediaUrl(localDataUrl)
            setUploadError('Media saved locally. Start backend/server to sync this media across devices.')
          })
          .catch(() => {
            setUploadError('Media upload failed. Please try another file.')
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
      .catch(() => {
        setIsMusicUploading(false)
        readFileAsDataUrl(file)
          .then((localDataUrl) => {
            clearMusicPreviewBlobUrl()
            setMusicUrl(localDataUrl)
            setUploadError('Music saved locally. Start backend/server to sync this media across devices.')
          })
          .catch(() => {
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

    if ((mediaUrl && mediaUrl.startsWith('blob:')) || (musicUrl && musicUrl.startsWith('blob:'))) {
      setUploadError('Upload is not finished. Retry upload so your story/post is saved on all devices.')
      return
    }

    const nextTitle = composerMode === 'story'
      ? (challengeTitle.trim() || 'New Story')
      : (challengeTitle.trim() || 'New Post')
    const nextText = composerMode === 'story' ? '' : text.trim()

    if (!nextText && !mediaUrl) {
      return
    }

    const payload = {
      challengeTitle: nextTitle,
      text: nextText,
      mediaType,
      mediaUrl,
      musicUrl: composerMode === 'story' ? musicUrl : null,
      musicName: composerMode === 'story' ? musicName : '',
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

    // If upload failed and we are using a local blob URL, keep it alive for the new post.
    if (mediaUrl && previewBlobUrlRef.current === mediaUrl) {
      previewBlobUrlRef.current = null
    }
    if (musicUrl && musicPreviewBlobUrlRef.current === musicUrl) {
      musicPreviewBlobUrlRef.current = null
    }

    closeComposer()
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
            <span className="brand-mark" aria-hidden="true">C</span>
            <span className="brand-word">Challenger</span>
          </span>
          {' '}
          &middot; 2026
        </p>
      </aside>

      {/* ── Center feed ── */}
      <main className="fb-feed">
        {/* Composer */}
        <div className="fb-composer" style={{
          backgroundImage: `url(${currentUser.coverPhoto || getAvatar(currentUser)})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundAttachment: 'fixed',
        }}>
          <div className="fb-composer-overlay" />
          <img src={getAvatar(currentUser)} alt={currentUser.name} className="fb-composer-avatar" />
          <button type="button" className="fb-composer-pill" onClick={() => openComposer('post')}>
            What's your challenge today, {currentUser.name.split(' ')[0]}?
          </button>
        </div>

        {/* Stories */}
        <div className="stories-head">
          <h3 className="stories-title">Stories</h3>
        </div>
        <StoryStrip
          users={users}
          stories={stories}
          currentUserId={currentUser.id}
          onCreateStory={() => openComposer('story')}
          onEditStory={openStoryEditor}
          onDeleteStory={onDeleteStory}
          onNavigateToProfile={onNavigateToProfile}
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
        {/* Top Challengers */}
        <div className="fb-widget">
          <h4 className="fb-widget-title">Top Challengers</h4>
          {topChallengers.map((user, i) => (
            <button key={user.id} type="button" className="fb-contact-row" onClick={() => onNavigateToProfile?.(user.id)}>
              <span className="fb-contact-rank">#{i + 1}</span>
              <img src={getAvatar(user)} alt={user.name} className="fb-contact-avatar" />
              <div className="fb-contact-info">
                <strong>{user.name}</strong>
                <p>{user.totalVotes} votes</p>
              </div>
            </button>
          ))}
        </div>

        {/* Active challenges */}
        <div className="fb-widget">
          <h4 className="fb-widget-title">Active Challenges</h4>
          {posts.map((post) => {
            const author = users.find((u) => u.id === post.userId)
            return (
              <button
                key={post.id}
                type="button"
                className="fb-contact-row"
                onClick={() => author && onNavigateToProfile?.(author.id)}
              >
                <img src={getAvatar(author)} alt={author?.name} className="fb-contact-avatar" />
                <div className="fb-contact-info">
                  <strong>{post.challengeTitle}</strong>
                  <p>{post.challengeVotes} votes</p>
                </div>
              </button>
            )
          })}
        </div>
      </aside>

      {composerOpen && (
        <div className="composer-modal-backdrop" role="dialog" aria-modal="true">
          <div className="composer-modal">
            <div className="composer-modal-head">
              <div>
                <h3>{composerMode === 'story' ? 'Create New Challenge' : 'Create Post'}</h3>
                <p>
                  {editingTarget
                    ? 'Update your content and save the changes.'
                    : 'Share text, a poster image, or a video like Facebook.'}
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
                    Title
                    <input
                      type="text"
                      value={challengeTitle}
                      onChange={(event) => setChallengeTitle(event.target.value)}
                      placeholder="Post title"
                    />
                  </label>

                  <label>
                    Caption
                    <textarea
                      value={text}
                      onChange={(event) => setText(event.target.value)}
                      placeholder="Write something to post"
                      rows={5}
                    />
                  </label>
                </>
              ) : null}

              <label>
                Upload image or video
                <input type="file" accept="image/*,video/*" onChange={handleMediaChange} />
              </label>

              {composerMode === 'story' ? (
                <label>
                  Optional music
                  <input type="file" accept="audio/*" onChange={handleMusicChange} />
                </label>
              ) : null}

              {mediaUrl && (
                <div className="composer-preview">
                  {mediaType === 'video' ? (
                    <video src={mediaUrl} controls className="composer-preview-media" />
                  ) : (
                    <img src={mediaUrl} alt="Upload preview" className="composer-preview-media" />
                  )}
                </div>
              )}

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
                      ? 'Share Challenge'
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
