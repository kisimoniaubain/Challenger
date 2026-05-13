import { useEffect, useRef, useState } from 'react'
import { uploadMediaFile } from '../services/api'
import { getAvatar, getCoverPhoto } from '../utils/avatar'

export default function UserProfilePage({
  user,
  currentUserId,
  users,
  posts,
  followGraph,
  onNavigate,
  onAddStory,
  onTabChange,
  onUpdateAvatar,
  onUpdateCoverPhoto,
  t,
}) {
  const tx = t || ((value) => value)
  const isOwnProfile = user?.id === currentUserId
  const userPosts = user ? posts.filter((post) => post.userId === user.id) : []
  const postCount = userPosts.length
  const [isFollowing, setIsFollowing] = useState(false)
  const [baseFollowerCount] = useState(() => Math.floor(Math.random() * 500) + 50)
  const followerCount = baseFollowerCount + (isFollowing ? 1 : 0)
  const followingCount = user ? (Array.isArray(followGraph?.[user.id]) ? followGraph[user.id].length : 0) : 0
  const [activeTab, setActiveTab] = useState('posts')
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [isAvatarUploading, setIsAvatarUploading] = useState(false)
  const [isCoverUploading, setIsCoverUploading] = useState(false)
  const moreMenuRef = useRef(null)

  useEffect(() => {
    function handleDocumentClick(event) {
      if (!moreMenuRef.current?.contains(event.target)) {
        setIsMoreMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handleDocumentClick)
    return () => {
      document.removeEventListener('mousedown', handleDocumentClick)
    }
  }, [])

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result || ''))
      reader.onerror = () => reject(new Error('Unable to read selected file.'))
      reader.readAsDataURL(file)
    })
  }

  async function updateImage(file, onSuccess, setUploading) {
    if (!isOwnProfile) return

    setUploading(true)
    try {
      setUploadError('')
      const previewUrl = await readFileAsDataUrl(file)
      onSuccess?.(previewUrl)

      const uploadResult = await uploadMediaFile(file)
      if (!uploadResult?.url) {
        throw new Error('Upload returned no URL.')
      }
      onSuccess?.(uploadResult.url)
    } catch {
      setUploadError('Photo updated locally. Start backend/server to sync this photo across devices.')
    } finally {
      setUploading(false)
    }
  }

  function handleAvatarChange(event) {
    const file = event.target.files?.[0]
    if (!file || !isOwnProfile) return
    updateImage(file, onUpdateAvatar, setIsAvatarUploading)
  }

  function handleCoverPhotoChange(event) {
    const file = event.target.files?.[0]
    if (!file || !isOwnProfile) return
    updateImage(file, onUpdateCoverPhoto, setIsCoverUploading)
  }

  if (!user) {
    return (
      <section className="user-profile-page">
        <div className="basic-page">
          <h2>User Not Found</h2>
          <p>This user doesn't exist.</p>
        </div>
      </section>
    )
  }

  return (
    <section className="user-profile-page">
      {/* Cover Image */}
      <div className="profile-cover">
        <img
          src={getCoverPhoto(user)}
          alt={`${user.name} cover`}
          className="profile-cover-image"
        />
        {isOwnProfile && (
          <>
            <label
              className={`cover-photo-upload-btn ${isCoverUploading ? 'is-uploading' : ''}`}
              htmlFor="cover-photo-upload"
              aria-label="Change cover photo"
              title="Change cover photo"
            >
              <i
                className={`fa-solid ${isCoverUploading ? 'fa-spinner fa-spin' : 'fa-pen'}`}
                aria-hidden="true"
              />
            </label>
            <input
              id="cover-photo-upload"
              type="file"
              accept="image/*"
              className="cover-photo-upload-input"
              onChange={handleCoverPhotoChange}
            />
          </>
        )}
      </div>

      {/* Profile Header */}
      <div className="profile-header">
        <div className="profile-avatar-large-wrap">
          <img
            src={getAvatar(user)}
            alt={user.name}
            className="profile-avatar-large"
          />
          {isOwnProfile && (
            <>
              <label
                className={`profile-avatar-upload-btn ${isAvatarUploading ? 'is-uploading' : ''}`}
                htmlFor="profile-avatar-upload"
                aria-label="Change profile photo"
                title="Change profile photo"
              >
                <i
                  className={`fa-solid ${isAvatarUploading ? 'fa-spinner fa-spin' : 'fa-pen'}`}
                  aria-hidden="true"
                />
              </label>
              <input
                id="profile-avatar-upload"
                type="file"
                accept="image/*"
                className="profile-avatar-upload-input"
                onChange={handleAvatarChange}
              />
            </>
          )}
        </div>

        <div className="profile-info-section">
          <div className="profile-name-row">
            <h1>{user.name}</h1>
          </div>

          <p className="profile-email">{user.email}</p>
          {isOwnProfile && (isAvatarUploading || isCoverUploading) ? (
            <p className="profile-uploading-hint">Saving your photo changes...</p>
          ) : null}
          {isOwnProfile && uploadError ? <p className="composer-upload-error">{uploadError}</p> : null}

          {/* Stats Row */}
          <div className="profile-stats">
            <div className="stat-item">
              <span className="stat-number">{postCount}</span>
              <span className="stat-label">{tx('Posts')}</span>
            </div>
            <div className="stat-item">
              <span className="stat-number">{followerCount}</span>
              <span className="stat-label">{tx('Followers')}</span>
            </div>
            <div className="stat-item">
              <span className="stat-number">{followingCount}</span>
              <span className="stat-label">{tx('Following')}</span>
            </div>
            <div className="stat-item">
              <span className="stat-number">{user.totalVotes}</span>
              <span className="stat-label">{tx('Challenge Votes')}</span>
            </div>
          </div>

          <div className="profile-action-row" aria-label="Profile actions">
            {isOwnProfile ? (
              <button type="button" className="fb-primary-action-btn" onClick={() => onAddStory?.()}>
                <i className="fa-solid fa-circle-plus" aria-hidden="true" /> {tx('Add to Story')}
              </button>
            ) : (
              <button
                type="button"
                className="fb-primary-action-btn"
                onClick={() => setIsFollowing((current) => !current)}
              >
                <i className={`fa-solid ${isFollowing ? 'fa-user-check' : 'fa-user-plus'}`} aria-hidden="true" />
                {isFollowing ? tx('Following') : tx('Follow')}
              </button>
            )}

            <div className="profile-more-wrap" ref={moreMenuRef}>
              <button
                type="button"
                className="fb-secondary-action-btn"
                onClick={() => setIsMoreMenuOpen((open) => !open)}
                aria-haspopup="menu"
                aria-expanded={isMoreMenuOpen}
              >
                <i className="fa-solid fa-ellipsis" aria-hidden="true" /> {tx('More')}
              </button>

              {isMoreMenuOpen ? (
                <div className="profile-more-menu" role="menu" aria-label="More profile actions">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setActiveTab('posts')
                      setIsMoreMenuOpen(false)
                    }}
                  >
                    <i className="fa-solid fa-image" aria-hidden="true" /> {tx('View Posts')}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setActiveTab('about')
                      setIsMoreMenuOpen(false)
                    }}
                  >
                    <i className="fa-solid fa-circle-info" aria-hidden="true" /> {tx('About Profile')}
                  </button>
                  {isOwnProfile ? (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        onNavigate?.('settings')
                        setIsMoreMenuOpen(false)
                      }}
                    >
                      <i className="fa-solid fa-user-pen" aria-hidden="true" /> {tx('Edit Profile')}
                    </button>
                  ) : (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        onTabChange?.('messages')
                        setIsMoreMenuOpen(false)
                      }}
                    >
                      <i className="fa-solid fa-message" aria-hidden="true" /> Message
                    </button>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="profile-tabs">
        <button
          className={`tab-btn ${activeTab === 'posts' ? 'active' : ''}`}
          onClick={() => setActiveTab('posts')}
        >
          <i className="fa-solid fa-image" aria-hidden="true" /> Posts
        </button>
        <button
          className={`tab-btn ${activeTab === 'about' ? 'active' : ''}`}
          onClick={() => setActiveTab('about')}
        >
          <i className="fa-solid fa-circle-info" aria-hidden="true" /> About
        </button>
      </div>

      {/* Tab Content */}
      <div className="profile-tab-content">
        {activeTab === 'posts' && (
          <div className="user-posts-list">
            {userPosts.length === 0 ? (
              <p className="empty-message">No posts yet.</p>
            ) : (
              <div className="posts-grid">
                {userPosts.map((post) => (
                  <div key={post.id} className="post-thumbnail">
                    {post.mediaUrl ? (
                      post.mediaType === 'video' ? (
                        <video className="thumbnail-media" src={post.mediaUrl} muted />
                      ) : (
                        <img className="thumbnail-media" src={post.mediaUrl} alt="Post" />
                      )
                    ) : (
                      <div className="thumbnail-placeholder">
                        <p>{post.text.substring(0, 50)}...</p>
                      </div>
                    )}
                    <div className="thumbnail-overlay">
                      <span className="thumbnail-stat">
                        <i className="fa-solid fa-heart" aria-hidden="true" /> {post.likes}
                      </span>
                      <span className="thumbnail-stat">
                        <i className="fa-solid fa-comment" aria-hidden="true" /> {post.comments}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'about' && (
          <div className="user-about">
            <div className="about-section">
              <h3>About</h3>
              <p className="about-item">
                <strong>Email:</strong> {user.email}
              </p>
              <p className="about-item">
                <strong>Joined:</strong> 2024
              </p>
              <p className="about-item">
                <strong>Total Votes:</strong> {user.totalVotes}
              </p>
              <p className="about-item">
                <strong>Posts:</strong> {postCount}
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
