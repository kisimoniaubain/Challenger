import { useEffect, useMemo, useRef, useState } from 'react'
import { uploadMediaFile } from '../services/api'
import PostCard from '../components/PostCard'
import { getAvatar } from '../utils/avatar'

export default function ChallengesPage({
  currentUser,
  posts,
  users,
  likedPosts,
  votedPosts,
  onLike,
  onComment,
  onShare,
  onVote,
  onCreatePost,
  onEditPost,
  onDeletePost,
  onNavigateToProfile,
  t,
}) {
  const tx = t || ((value) => value)
  const [uploaderOpen, setUploaderOpen] = useState(false)
  const [editingPostId, setEditingPostId] = useState(null)
  const [challengeTitle, setChallengeTitle] = useState('')
  const [text, setText] = useState('')
  const [mediaType, setMediaType] = useState(null)
  const [mediaUrl, setMediaUrl] = useState(null)
  const [clipsView, setClipsView] = useState('all')
  const previewBlobUrlRef = useRef(null)

  const visiblePosts = useMemo(() => {
    if (clipsView === 'top') {
      return [...posts]
        .sort((left, right) => {
          if (right.challengeVotes !== left.challengeVotes) {
            return right.challengeVotes - left.challengeVotes
          }

          return right.likes - left.likes
        })
        .slice(0, 3)
    }

    return posts
  }, [clipsView, posts])

  function clearPreviewBlobUrl() {
    if (previewBlobUrlRef.current) {
      URL.revokeObjectURL(previewBlobUrlRef.current)
      previewBlobUrlRef.current = null
    }
  }

  useEffect(() => {
    return () => {
      clearPreviewBlobUrl()
    }
  }, [])

  function resetUploaderState() {
    clearPreviewBlobUrl()
    setEditingPostId(null)
    setChallengeTitle('')
    setText('')
    setMediaType(null)
    setMediaUrl(null)
  }

  function closeUploader() {
    resetUploaderState()
    setUploaderOpen(false)
  }

  function handleEditClip(post) {
    const firstMediaItem = Array.isArray(post.mediaItems) && post.mediaItems.length > 0
      ? post.mediaItems[0]
      : null

    setEditingPostId(post.id)
    setChallengeTitle(post.challengeTitle || 'Clip Entry')
    setText(post.text || '')
    setMediaType(firstMediaItem?.type || post.mediaType || null)
    setMediaUrl(firstMediaItem?.url || post.mediaUrl || null)
    setUploaderOpen(true)
  }

  function handleMediaChange(event) {
    const file = event.target.files?.[0]
    if (!file) {
      clearPreviewBlobUrl()
      setMediaType(null)
      setMediaUrl(null)
      return
    }

    const nextMediaType = file.type.startsWith('video/') ? 'video' : 'image'
    const previewBlobUrl = URL.createObjectURL(file)
    clearPreviewBlobUrl()
    previewBlobUrlRef.current = previewBlobUrl
    setMediaType(nextMediaType)
    setMediaUrl(previewBlobUrl)

    uploadMediaFile(file)
      .then((uploadResult) => {
        clearPreviewBlobUrl()
        setMediaUrl(uploadResult.url)
        setMediaType(nextMediaType)
      })
      .catch(() => {
        // Keep the local blob preview when upload fails.
      })
  }

  function handleUploadSubmit(event) {
    event.preventDefault()
    const nextTitle = challengeTitle.trim() || 'Clip Entry'
    const nextText = text.trim()
    const nextMediaItems = mediaUrl ? [{ type: mediaType, url: mediaUrl }] : []

    if (!nextText && !mediaUrl) {
      alert('Please add text or media for your clip entry')
      return
    }

    if (editingPostId) {
      onEditPost?.(editingPostId, {
        challengeTitle: nextTitle,
        text: nextText,
        mediaItems: nextMediaItems,
        postType: 'challenge',
      })
    } else {
      onCreatePost({
        challengeTitle: nextTitle,
        text: nextText,
        mediaItems: nextMediaItems,
        mediaType,
        mediaUrl,
        postType: 'challenge',
      })
    }

    // If upload failed and we are using a local blob URL, keep it alive for the saved post.
    if (mediaUrl && previewBlobUrlRef.current === mediaUrl) {
      previewBlobUrlRef.current = null
    }

    closeUploader()
  }

  return (
    <section className="challenges-page">
      <h2>{tx('Clips')}</h2>
      <div className="clips-profile-header">
        <button
          type="button"
          className="clips-profile-row"
          onClick={() => onNavigateToProfile?.(currentUser.id)}
        >
          <img src={getAvatar(currentUser)} alt={currentUser.name} className="clips-profile-avatar" />
        </button>
        <button
          type="button"
          className="btn-upload-to-profile"
          onClick={() => setUploaderOpen(true)}
        >
          <i className="fa-solid fa-plus" aria-hidden="true" /> Upload Clip Entry
        </button>
      </div>
      <p className="subtitle">Vote for your favorite clip entries.</p>

      {/* View Filter Section */}
      <div className="clips-view-controls">
        <button
          type="button"
          className={`clips-filter-btn ${clipsView === 'all' ? 'active' : ''}`}
          onClick={() => setClipsView('all')}
        >
          All Clips
        </button>
        <button
          type="button"
          className={`clips-filter-btn ${clipsView === 'top' ? 'active' : ''}`}
          onClick={() => setClipsView(clipsView === 'top' ? 'all' : 'top')}
        >
          {clipsView === 'top' ? '✓ Top Clips' : 'Top Clips'}
        </button>
      </div>

      {/* Upload Challenge Entry Section */}
      <div className="challenge-upload-section">
        {uploaderOpen && (
          <form className="challenge-uploader-form" onSubmit={handleUploadSubmit}>
            <div className="uploader-header">
              <h3>{editingPostId ? 'Edit Clip Post' : 'Create Clip Entry'}</h3>
              <button
                type="button"
                className="close-btn"
                onClick={closeUploader}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="form-group">
              <label htmlFor="challengeText">Description</label>
              <textarea
                id="challengeText"
                placeholder="Tell people about your entry..."
                value={text}
                onChange={(e) => setText(e.target.value)}
                className="form-textarea"
                rows="4"
              />
            </div>

            <div className="form-group">
              <label htmlFor="challengeMedia">
                <i className="fa-solid fa-video" aria-hidden="true" /> Upload Video or Image
              </label>
              <input
                id="challengeMedia"
                type="file"
                accept="video/*,image/*"
                onChange={handleMediaChange}
                className="form-file"
              />
              {mediaUrl && (
                <div className="media-preview">
                  {mediaType === 'video' ? (
                    <video className="preview-media" src={mediaUrl} controls>
                      Your browser does not support video playback.
                    </video>
                  ) : (
                    <img className="preview-media" src={mediaUrl} alt="Preview" />
                  )}
                  <button
                    type="button"
                    className="btn-remove-media"
                    onClick={() => {
                      clearPreviewBlobUrl()
                      setMediaUrl(null)
                      setMediaType(null)
                    }}
                  >
                    <i className="fa-solid fa-trash" aria-hidden="true" /> Remove
                  </button>
                </div>
              )}
            </div>

            <div className="form-actions">
              <button type="submit" className="btn-primary">
                <i className="fa-solid fa-paper-plane" aria-hidden="true" /> Submit Entry
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={closeUploader}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
      <div className="feed-list" role="feed">
        {visiblePosts.map((post) => {
          const author = users.find((user) => user.id === post.userId)
          const hasVoted = votedPosts.includes(post.id)
          const isOwner = post.userId === currentUser.id
          return (
            <PostCard
              key={post.id}
              post={post}
              author={author}
              currentUser={currentUser}
              isOwner={isOwner}
              hasLiked={likedPosts.includes(post.id)}
              hasVoted={hasVoted}
              onLike={() => onLike(post.id)}
              onComment={() => onComment(post.id)}
              onShare={() => onShare(post.id)}
              onVote={() => onVote(post.id)}
              onEdit={() => handleEditClip(post)}
              onDelete={() => onDeletePost?.(post.id)}
              onNavigateToProfile={onNavigateToProfile}
              enableInlineVideoPlayback
            />
          )
        })}
      </div>
    </section>
  )
}
