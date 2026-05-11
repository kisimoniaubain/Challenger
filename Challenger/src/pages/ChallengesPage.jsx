import { useEffect, useRef, useState } from 'react'
import { uploadMediaFile } from '../services/api'
import { getAvatar } from '../utils/avatar'

export default function ChallengesPage({
  currentUser,
  posts,
  users,
  votedPosts,
  onVote,
  onCreatePost,
  onNavigateToProfile,
}) {
  const [uploaderOpen, setUploaderOpen] = useState(false)
  const [challengeTitle, setChallengeTitle] = useState('')
  const [text, setText] = useState('')
  const [mediaType, setMediaType] = useState(null)
  const [mediaUrl, setMediaUrl] = useState(null)
  const previewBlobUrlRef = useRef(null)

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
    setChallengeTitle('')
    setText('')
    setMediaType(null)
    setMediaUrl(null)
  }

  function closeUploader() {
    resetUploaderState()
    setUploaderOpen(false)
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
    const nextTitle = challengeTitle.trim() || 'Challenge Entry'
    const nextText = text.trim()

    if (!nextText && !mediaUrl) {
      alert('Please add text or media for your challenge entry')
      return
    }

    onCreatePost({
      challengeTitle: nextTitle,
      text: nextText,
      mediaType,
      mediaUrl,
    })

    // If upload failed and we are using a local blob URL, keep it alive for the saved post.
    if (mediaUrl && previewBlobUrlRef.current === mediaUrl) {
      previewBlobUrlRef.current = null
    }

    closeUploader()
  }

  return (
    <section className="challenges-page">
      <h2>Challenges</h2>
      <p className="subtitle">Vote for your favorite challenge entries.</p>

      {/* Upload Challenge Entry Section */}
      <div className="challenge-upload-section">
        {!uploaderOpen ? (
          <button
            type="button"
            className="btn-upload-challenge"
            onClick={() => setUploaderOpen(true)}
          >
            <i className="fa-solid fa-plus" aria-hidden="true" /> Upload Challenge Entry
          </button>
        ) : (
          <form className="challenge-uploader-form" onSubmit={handleUploadSubmit}>
            <div className="uploader-header">
              <h3>Create Challenge Entry</h3>
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
              <label htmlFor="challengeTitle">Challenge Title (optional)</label>
              <input
                id="challengeTitle"
                type="text"
                placeholder="e.g., 'My Amazing Rendition'"
                value={challengeTitle}
                onChange={(e) => setChallengeTitle(e.target.value)}
                className="form-input"
              />
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

      {/* Challenge Cards Grid */}
      <div className="challenge-grid">
        {posts.map((post) => {
          const author = users.find((user) => user.id === post.userId)
          const hasVoted = votedPosts.includes(post.id)
          return (
            <article key={post.id} className="challenge-card">
              <div className="challenge-head">
                <button
                  type="button"
                  className="challenge-user-link"
                  onClick={() => onNavigateToProfile?.(author?.id)}
                >
                  <img src={getAvatar(author)} alt={author?.name} className="post-avatar" />
                  <div>
                    <h3>{post.challengeTitle}</h3>
                    <p>{author?.name}</p>
                  </div>
                </button>
              </div>

              {post.mediaUrl && (
                <div className="challenge-media">
                  {post.mediaType === 'video' ? (
                    <video className="post-media" src={post.mediaUrl} controls>
                      Your browser does not support video playback.
                    </video>
                  ) : (
                    <img className="post-media" src={post.mediaUrl} alt={post.text} />
                  )}
                </div>
              )}

              <p className="challenge-text">{post.text}</p>

              <button
                type="button"
                className="vote-btn"
                onClick={() => onVote(post.id)}
                disabled={hasVoted}
              >
                <i className="fa-solid fa-thumbs-up" aria-hidden="true" />
                {hasVoted ? 'Voted' : `Vote (${post.challengeVotes})`}
              </button>
            </article>
          )
        })}
      </div>
    </section>
  )
}
