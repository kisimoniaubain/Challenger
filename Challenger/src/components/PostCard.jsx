import { useState, useRef } from 'react'
import { getAvatar } from '../utils/avatar'

function MediaBlock({ post, authorName }) {
  if (!post.mediaUrl || !post.mediaType) return null

  if (post.mediaType === 'video') {
    return (
      <video className="post-media" src={post.mediaUrl} controls>
        Your browser does not support video playback.
      </video>
    )
  }

  return <img className="post-media" src={post.mediaUrl} alt={`${authorName} post`} />
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
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [showComments, setShowComments] = useState(false)
  const [commentText, setCommentText] = useState('')
  const [localComments, setLocalComments] = useState([])
  const commentInputRef = useRef(null)

  function handleCommentBtnClick() {
    setShowComments(true)
    setTimeout(() => commentInputRef.current?.focus(), 50)
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
            {post.timestamp} &middot; <i className="fa-solid fa-earth-africa" aria-hidden="true" />
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
              <button type="button" onClick={() => { setMenuOpen(false); onEdit() }}>
                <i className="fa-solid fa-pen" aria-hidden="true" /> Edit
              </button>
              <button type="button" onClick={() => { setMenuOpen(false); onDelete() }}>
                <i className="fa-solid fa-trash" aria-hidden="true" /> Delete
              </button>
            </div>
          ) : null}
        </div>
      </header>

      {/* Body */}
      {post.text && <p className="post-text">{post.text}</p>}

      <MediaBlock post={post} authorName={author?.name || 'User'} />


      {/* Action buttons */}
      <div className="post-actions">
        <button
          type="button"
          className={`post-action-btn${hasLiked ? ' active' : ''}`}
          onClick={onLike}
        >
          <i className="fa-regular fa-thumbs-up" aria-hidden="true" /> Like {post.likes}
        </button>

        <button type="button" className="post-action-btn" onClick={handleCommentBtnClick}>
          <i className="fa-regular fa-message" aria-hidden="true" /> Comment {post.comments + localComments.length}
        </button>

        <button type="button" className="post-action-btn" onClick={onShare}>
          <i className="fa-solid fa-share" aria-hidden="true" /> Share {post.shares}
        </button>

        <button
          type="button"
          className={`post-action-btn vote-action-btn${hasVoted ? ' voted' : ''}`}
          onClick={onVote}
          disabled={hasVoted}
        >
          <i className="fa-solid fa-trophy" aria-hidden="true" />
          {hasVoted ? 'Voted' : 'Vote'} {post.challengeVotes}
        </button>
      </div>

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
