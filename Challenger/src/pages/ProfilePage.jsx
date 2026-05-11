import { useState } from 'react'
import { uploadMediaFile } from '../services/api'
import { getAvatar, getCoverPhoto } from '../utils/avatar'

export default function ProfilePage({
  currentUser,
  posts,
  onNavigate,
  onUpdateAvatar,
  onUpdateCoverPhoto,
}) {
  const userPosts = posts.filter((post) => post.userId === currentUser.id)
  const postCount = userPosts.length
  const followerCount = Math.floor(Math.random() * 500) + 50
  const [activeTab, setActiveTab] = useState('posts')

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result || ''))
      reader.onerror = () => reject(new Error('Unable to read selected file.'))
      reader.readAsDataURL(file)
    })
  }

  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve(url)
      image.onerror = () => reject(new Error('Unable to load image preview.'))
      image.src = url
    })
  }

  async function updateImage(file, onSuccess) {
    try {
      const previewUrl = await readFileAsDataUrl(file)
      onSuccess?.(previewUrl)

      const uploadResult = await uploadMediaFile(file)
      await loadImage(uploadResult.url)
      onSuccess?.(uploadResult.url)
    } catch {
      // Keep the local preview if remote upload or image loading fails.
    }
  }

  function handleAvatarChange(event) {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    updateImage(file, onUpdateAvatar)
  }

  function handleCoverPhotoChange(event) {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    updateImage(file, onUpdateCoverPhoto)
  }

  return (
    <section className="user-profile-page">
      {/* Cover Image */}
      <div className="profile-cover">
        <img
          src={getCoverPhoto(currentUser)}
          alt={`${currentUser.name} cover`}
          className="profile-cover-image"
        />
        <label className="cover-photo-upload-btn" htmlFor="cover-photo-upload">
          <i className="fa-solid fa-camera" aria-hidden="true" /> Add cover photo
        </label>
        <input
          id="cover-photo-upload"
          type="file"
          accept="image/*"
          className="cover-photo-upload-input"
          onChange={handleCoverPhotoChange}
        />
      </div>

      {/* Profile Header */}
      <div className="profile-header">
        <div className="profile-avatar-large-wrap">
          <img
            src={getAvatar(currentUser)}
            alt={currentUser.name}
            className="profile-avatar-large"
          />
          <label className="profile-avatar-upload-btn" htmlFor="profile-avatar-upload">
            <i className="fa-solid fa-camera" aria-hidden="true" />
            <span>Change photo</span>
          </label>
          <input
            id="profile-avatar-upload"
            type="file"
            accept="image/*"
            className="profile-avatar-upload-input"
            onChange={handleAvatarChange}
          />
        </div>

        <div className="profile-info-section">
          <div className="profile-name-row">
            <h1>{currentUser.name}</h1>
            <button className="btn-secondary" onClick={() => onNavigate('settings')}>
              <i className="fa-solid fa-gear" aria-hidden="true" /> Edit Profile
            </button>
          </div>

          <p className="profile-email">{currentUser.email}</p>

          {/* Stats Row */}
          <div className="profile-stats">
            <div className="stat-item">
              <span className="stat-number">{postCount}</span>
              <span className="stat-label">Posts</span>
            </div>
            <div className="stat-item">
              <span className="stat-number">{followerCount}</span>
              <span className="stat-label">Followers</span>
            </div>
            <div className="stat-item">
              <span className="stat-number">{currentUser.totalVotes}</span>
              <span className="stat-label">Challenge Votes</span>
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
                <strong>Email:</strong> {currentUser.email}
              </p>
              <p className="about-item">
                <strong>Joined:</strong> 2024
              </p>
              <p className="about-item">
                <strong>Total Votes:</strong> {currentUser.totalVotes}
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
