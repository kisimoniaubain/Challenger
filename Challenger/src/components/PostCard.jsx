import { useEffect, useRef, useState } from 'react'
import { getAvatar } from '../utils/avatar'

function formatRelativePostTime(createdAt) {
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

function canEditPost(createdAt) {
  const createdAtMs = Date.parse(createdAt || '')
  if (!Number.isFinite(createdAtMs)) {
    return true
  }

  return Date.now() - createdAtMs <= 10 * 60 * 1000
}

function MediaGallery({ mediaItems, authorName, onOpenItem, enableInlineVideoPlayback = false }) {
  if (mediaItems.length === 0) return null

  if (mediaItems.length === 1) {
    const item = mediaItems[0]
    if (item.type === 'video' && enableInlineVideoPlayback) {
      return (
        <div className="post-media-single-btn post-inline-video-shell">
          <video className="post-media" src={item.url} controls muted playsInline>
            Your browser does not support video playback.
          </video>
          <button
            type="button"
            className="post-inline-open-btn"
            onClick={() => onOpenItem(0)}
            aria-label="Open video"
          >
            <i className="fa-solid fa-expand" aria-hidden="true" /> Open
          </button>
        </div>
      )
    }

    return (
      <button
        type="button"
        className="post-media-single-btn"
        onClick={() => onOpenItem(0)}
        aria-label="Open media"
      >
        {item.type === 'video' ? (
          <video className="post-media" src={item.url} muted playsInline>
            Your browser does not support video playback.
          </video>
        ) : (
          <img className="post-media" src={item.url} alt={`${authorName} post`} />
        )}
      </button>
    )
  }

  const visibleItems = mediaItems.slice(0, 4)
  const extraCount = mediaItems.length - visibleItems.length

  return (
    <div className={`post-media-gallery count-${visibleItems.length}`}>
      {visibleItems.map((item, index) => {
        if (item.type === 'video' && enableInlineVideoPlayback) {
          return (
            <div key={index} className="post-gallery-item post-inline-video-shell">
              <video className="post-gallery-media" src={item.url} controls muted playsInline>
                Your browser does not support video playback.
              </video>
              <button
                type="button"
                className="post-inline-open-btn"
                onClick={() => onOpenItem(index)}
                aria-label={`Open video ${index + 1}`}
              >
                <i className="fa-solid fa-expand" aria-hidden="true" /> Open
              </button>
              {extraCount > 0 && index === visibleItems.length - 1 ? (
                <div className="post-gallery-more">+{extraCount}</div>
              ) : null}
            </div>
          )
        }

        return (
          <button
            key={index}
            type="button"
            className="post-gallery-item"
            onClick={() => onOpenItem(index)}
            aria-label={`Open media ${index + 1}`}
          >
            {item.type === 'video' ? (
              <video className="post-gallery-media" src={item.url} muted playsInline>
                Your browser does not support video playback.
              </video>
            ) : (
              <img className="post-gallery-media" src={item.url} alt={`${authorName} post item ${index + 1}`} />
            )}
            {extraCount > 0 && index === visibleItems.length - 1 ? (
              <div className="post-gallery-more">+{extraCount}</div>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}

export default function PostCard({
  post,
  author,
  currentUser,
  isOwner,
  hasLiked,
  hasVoted,
  onLike,
  onComment,
  onShare,
  onVote,
  onEdit,
  onDelete,
  onNavigateToProfile,
  enableInlineVideoPlayback = false,
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [showComments, setShowComments] = useState(false)
  const [commentText, setCommentText] = useState('')
  const [localComments, setLocalComments] = useState([])
  const [relativeTimestamp, setRelativeTimestamp] = useState(() => formatRelativePostTime(post.createdAt))
  const [viewerOpen, setViewerOpen] = useState(false)
  const [shareSheetOpen, setShareSheetOpen] = useState(false)
  const [activeMediaIndex, setActiveMediaIndex] = useState(0)
  const commentInputRef = useRef(null)
  const touchStartRef = useRef({ x: 0, y: 0 })
  const touchCurrentRef = useRef({ x: 0, y: 0 })
  const allMediaItems = post.mediaItems && post.mediaItems.length > 0
    ? post.mediaItems
    : (post.mediaUrl ? [{ type: post.mediaType, url: post.mediaUrl }] : [])
  const activeMediaItem = allMediaItems[activeMediaIndex] || null
  const canManageThisPost = canEditPost(post.createdAt)
  const showVoteAction = post.postType === 'challenge'

  useEffect(() => {
    setRelativeTimestamp(formatRelativePostTime(post.createdAt))

    const timer = window.setInterval(() => {
      setRelativeTimestamp(formatRelativePostTime(post.createdAt))
    }, 60000)

    return () => window.clearInterval(timer)
  }, [post.createdAt])

  useEffect(() => {
    if (!viewerOpen) {
      return
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setViewerOpen(false)
      } else if (event.key === 'ArrowRight') {
        setActiveMediaIndex((current) => (current + 1) % allMediaItems.length)
      } else if (event.key === 'ArrowLeft') {
        setActiveMediaIndex((current) => (current - 1 + allMediaItems.length) % allMediaItems.length)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [viewerOpen, allMediaItems.length])

  function handleCommentBtnClick() {
    setShowComments(true)
    setTimeout(() => commentInputRef.current?.focus(), 50)
  }

  function openShareSheet() {
    setShareSheetOpen(true)
  }

  function closeShareSheet() {
    setShareSheetOpen(false)
  }

  function getSharePayload() {
    const contentText = (post.text || post.challengeTitle || 'Check this post on Challenger').trim()
    const postUrl = typeof window !== 'undefined' ? `${window.location.origin}/#post-${post.id}` : ''

    return {
      text: `${author?.name || 'User'}: ${contentText}`,
      url: postUrl,
    }
  }

  async function handleNativeShare() {
    if (typeof navigator === 'undefined' || !navigator.share) {
      return
    }

    const payload = getSharePayload()
    try {
      await navigator.share({
        title: 'Challenger Post',
        text: payload.text,
        url: payload.url,
      })
      onShare()
      closeShareSheet()
    } catch {
      // User may cancel; do nothing.
    }
  }

  async function handleCopyLinkShare() {
    const payload = getSharePayload()
    const shareLink = payload.url || (typeof window !== 'undefined' ? window.location.href : '')

    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareLink)
      }
      onShare()
      closeShareSheet()
    } catch {
      window.prompt('Copy this link:', shareLink)
      onShare()
      closeShareSheet()
    }
  }

  function handleExternalShare(platform) {
    const payload = getSharePayload()
    const encodedText = encodeURIComponent(payload.text)
    const encodedUrl = encodeURIComponent(payload.url)

    const platformUrls = {
      whatsapp: `https://wa.me/?text=${encodeURIComponent(`${payload.text} ${payload.url}`.trim())}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
      telegram: `https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`,
      x: `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`,
      email: `mailto:?subject=${encodeURIComponent('Challenger Post')}&body=${encodeURIComponent(`${payload.text}\n${payload.url}`.trim())}`,
    }

    const targetUrl = platformUrls[platform]
    if (!targetUrl) {
      return
    }

    window.open(targetUrl, '_blank', 'noopener,noreferrer')
    onShare()
    closeShareSheet()
  }

  function openMediaViewer(index) {
    if (allMediaItems.length === 0) {
      return
    }
    setActiveMediaIndex(index)
    setViewerOpen(true)
  }

  function closeMediaViewer() {
    setViewerOpen(false)
  }

  function showNextMedia() {
    setActiveMediaIndex((current) => (current + 1) % allMediaItems.length)
  }

  function showPreviousMedia() {
    setActiveMediaIndex((current) => (current - 1 + allMediaItems.length) % allMediaItems.length)
  }

  function handleViewerTouchStart(event) {
    const touch = event.touches?.[0]
    if (!touch) {
      return
    }
    touchStartRef.current = { x: touch.clientX, y: touch.clientY }
    touchCurrentRef.current = { x: touch.clientX, y: touch.clientY }
  }

  function handleViewerTouchMove(event) {
    const touch = event.touches?.[0]
    if (!touch) {
      return
    }
    touchCurrentRef.current = { x: touch.clientX, y: touch.clientY }
  }

  function handleViewerTouchEnd() {
    if (allMediaItems.length <= 1) {
      return
    }

    const deltaX = touchCurrentRef.current.x - touchStartRef.current.x
    const deltaY = touchCurrentRef.current.y - touchStartRef.current.y
    const absX = Math.abs(deltaX)
    const absY = Math.abs(deltaY)

    if (absX < 50 || absX <= absY * 1.2) {
      return
    }

    if (deltaX < 0) {
      showNextMedia()
    } else {
      showPreviousMedia()
    }
  }

  function handleCommentSubmit(e) {
    e.preventDefault()
    const text = commentText.trim()
    if (!text) return
    setLocalComments((prev) => [
      ...prev,
      {
        id: Date.now(),
        text,
        authorName: currentUser?.name || 'You',
          avatar: getAvatar(currentUser),
        time: 'Just now',
      },
    ])
    setCommentText('')
    onComment(post.id)
  }

  return (
    <article className="post-card" aria-label={`Post by ${author?.name}`}>
      {/* Header */}
      <header className="post-head">
        <button
          type="button"
          className="post-avatar-btn"
          onClick={() => author && onNavigateToProfile?.(author.id)}
          aria-label={`View ${author?.name} profile`}
        >
          <img src={getAvatar(author)} alt={author?.name} className="post-avatar" />
        </button>
        <div className="post-head-info">
          <button
            type="button"
            className="post-author-name-btn"
            onClick={() => author && onNavigateToProfile?.(author.id)}
          >
            <h3>{author?.name}</h3>
          </button>
          <p className="post-timestamp">
            {relativeTimestamp} &middot; <i className="fa-solid fa-earth-africa" aria-hidden="true" />
          </p>
        </div>
        <div className="post-more-wrap">
          <button
            type="button"
            className="post-more-btn"
            aria-label="More options"
            onClick={() => setMenuOpen((current) => !current)}
          >
            <i className="fa-solid fa-ellipsis" aria-hidden="true" />
          </button>

          {menuOpen && isOwner ? (
            <div className="post-owner-menu">
              <button
                type="button"
                disabled={!canManageThisPost}
                onClick={() => { setMenuOpen(false); onEdit() }}
              >
                <i className="fa-solid fa-pen" aria-hidden="true" /> Edit Post
              </button>
              <button
                type="button"
                disabled={!canManageThisPost}
                onClick={() => { setMenuOpen(false); onDelete() }}
              >
                <i className="fa-solid fa-trash" aria-hidden="true" /> Delete Post
              </button>
            </div>
          ) : null}
        </div>
      </header>

      {/* Body */}
      {post.text && <p className="post-text">{post.text}</p>}

      <MediaGallery
        mediaItems={allMediaItems}
        authorName={author?.name || 'User'}
        onOpenItem={openMediaViewer}
        enableInlineVideoPlayback={enableInlineVideoPlayback}
      />

      {viewerOpen && activeMediaItem ? (
        <div className="post-media-viewer-backdrop" role="dialog" aria-modal="true" aria-label="Post media viewer" onClick={closeMediaViewer}>
          <div className="post-media-viewer" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="post-media-viewer-close" onClick={closeMediaViewer} aria-label="Close media viewer">
              <i className="fa-solid fa-xmark" aria-hidden="true" />
            </button>

            {allMediaItems.length > 1 ? (
              <button type="button" className="post-media-viewer-nav prev" onClick={showPreviousMedia} aria-label="Previous media">
                <i className="fa-solid fa-chevron-left" aria-hidden="true" />
              </button>
            ) : null}

            <div
              className="post-media-viewer-content"
              onTouchStart={handleViewerTouchStart}
              onTouchMove={handleViewerTouchMove}
              onTouchEnd={handleViewerTouchEnd}
            >
              {activeMediaItem.type === 'video' ? (
                <video className="post-media-viewer-item" src={activeMediaItem.url} controls autoPlay playsInline>
                  Your browser does not support video playback.
                </video>
              ) : (
                <img className="post-media-viewer-item" src={activeMediaItem.url} alt={`${author?.name || 'User'} media ${activeMediaIndex + 1}`} />
              )}
            </div>

            {allMediaItems.length > 1 ? (
              <button type="button" className="post-media-viewer-nav next" onClick={showNextMedia} aria-label="Next media">
                <i className="fa-solid fa-chevron-right" aria-hidden="true" />
              </button>
            ) : null}

            {allMediaItems.length > 1 ? (
              <p className="post-media-viewer-index">
                {activeMediaIndex + 1} / {allMediaItems.length}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}


      {/* Action buttons */}
      <div className={`post-actions ${showVoteAction ? 'with-vote' : 'no-vote'}`}>
        <button
          type="button"
          className={`post-action-btn like-action-btn${hasLiked ? ' active' : ''}`}
          onClick={onLike}
          aria-label={hasLiked ? 'Unlike post' : 'Like post'}
        >
          <i className={`${hasLiked ? 'fa-solid' : 'fa-regular'} fa-thumbs-up`} aria-hidden="true" />
          <span className="post-action-count">{post.likes}</span>
        </button>

        <button type="button" className="post-action-btn" onClick={handleCommentBtnClick} aria-label="Comment on post">
          <i className="fa-regular fa-message" aria-hidden="true" />
          <span className="post-action-count">{post.comments + localComments.length}</span>
        </button>

        <button type="button" className="post-action-btn" onClick={openShareSheet} aria-label="Share post">
          <i className="fa-solid fa-share" aria-hidden="true" />
          <span className="post-action-count">{post.shares}</span>
        </button>

        {showVoteAction ? (
          <button
            type="button"
            className={`post-action-btn vote-action-btn${hasVoted ? ' voted' : ''}`}
            onClick={onVote}
            disabled={hasVoted}
            aria-label={hasVoted ? 'Already voted' : 'Vote for post'}
          >
            <i className="fa-solid fa-trophy" aria-hidden="true" />
            <span className="post-action-count">{post.challengeVotes}</span>
          </button>
        ) : null}
      </div>

      {shareSheetOpen ? (
        <div className="post-share-backdrop" role="dialog" aria-modal="true" aria-label="Share this post" onClick={closeShareSheet}>
          <div className="post-share-sheet" onClick={(event) => event.stopPropagation()}>
            <div className="post-share-head">
              <h4>Share Post</h4>
              <button type="button" className="post-share-close-btn" onClick={closeShareSheet} aria-label="Close share options">
                <i className="fa-solid fa-xmark" aria-hidden="true" />
              </button>
            </div>

            <div className="post-share-grid" role="list">
              <button type="button" className="post-share-app-btn" onClick={handleNativeShare}>
                <i className="fa-solid fa-share-nodes" aria-hidden="true" />
                <span>More Apps</span>
              </button>
              <button type="button" className="post-share-app-btn" onClick={() => handleExternalShare('whatsapp')}>
                <i className="fa-brands fa-whatsapp" aria-hidden="true" />
                <span>WhatsApp</span>
              </button>
              <button type="button" className="post-share-app-btn" onClick={() => handleExternalShare('facebook')}>
                <i className="fa-brands fa-facebook" aria-hidden="true" />
                <span>Facebook</span>
              </button>
              <button type="button" className="post-share-app-btn" onClick={() => handleExternalShare('telegram')}>
                <i className="fa-brands fa-telegram" aria-hidden="true" />
                <span>Telegram</span>
              </button>
              <button type="button" className="post-share-app-btn" onClick={() => handleExternalShare('x')}>
                <i className="fa-brands fa-x-twitter" aria-hidden="true" />
                <span>X</span>
              </button>
              <button type="button" className="post-share-app-btn" onClick={() => handleExternalShare('email')}>
                <i className="fa-solid fa-envelope" aria-hidden="true" />
                <span>Email</span>
              </button>
              <button type="button" className="post-share-app-btn" onClick={handleCopyLinkShare}>
                <i className="fa-solid fa-link" aria-hidden="true" />
                <span>Copy Link</span>
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Comments section */}
      {showComments && (
        <div className="post-comments-section">
          {localComments.length > 0 && (
            <div className="post-comments-list">
              {localComments.map((c) => (
                <div key={c.id} className="post-comment-item">
                  <img src={c.avatar || '/avatars/default-neutral.svg'} alt={c.authorName} className="comment-avatar" />
                  <div className="comment-bubble">
                    <span className="comment-author-name">{c.authorName}</span>
                    <p className="comment-text">{c.text}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
          <form className="post-comment-input-row" onSubmit={handleCommentSubmit}>
            <img src={getAvatar(currentUser)} alt="You" className="comment-avatar" />
            <input
              ref={commentInputRef}
              className="comment-input"
              type="text"
              placeholder="Write a comment…"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
            />
            <button type="submit" className="comment-send-btn" aria-label="Post comment">
              <i className="fa-solid fa-paper-plane" aria-hidden="true" />
            </button>
          </form>
        </div>
      )}
    </article>
  )
}
