import { useState } from 'react'

const DEFAULT_AVATAR =
  'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=200&q=80'

export default function UserProfilePage({ user, currentUserId, users, posts, onNavigate }) {
  const isOwnProfile = user?.id === currentUserId
  const userPosts = user ? posts.filter((post) => post.userId === user.id) : []
  const postCount = userPosts.length
  const [isFollowing, setIsFollowing] = useState(false)
  const [baseFollowerCount] = useState(() => Math.floor(Math.random() * 500) + 50)
  const followerCount = baseFollowerCount + (isFollowing ? 1 : 0)
  const [activeTab, setActiveTab] = useState('posts')
  const coverBackground = user?.coverPhoto
    ? `url(${user.coverPhoto})`
    : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'

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
      <div
        className="profile-cover"
        style={{
          backgroundImage: coverBackground,
          height: '300px',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      />

      {/* Profile Header */}
      <div className="profile-header">
        <div className="profile-avatar-large-wrap">
          <img
            src={user.avatar || DEFAULT_AVATAR}
            alt={user.name}
            className="profile-avatar-large"
          />
        </div>

        <div className="profile-info-section">
          <div className="profile-name-row">
            <h1>{user.name}</h1>
            {isOwnProfile && (
              <button className="btn-secondary" onClick={() => onNavigate('settings')}>
                Edit Profile
              </button>
            )}
            {!isOwnProfile && (
              <button className="btn-secondary" onClick={() => setIsFollowing((current) => !current)}>
                <i className="fa-solid fa-user-plus" aria-hidden="true" /> {isFollowing ? 'Following' : 'Follow'}
              </button>
            )}
          </div>

          <p className="profile-email">{user.email}</p>

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
              <span className="stat-number">{user.totalVotes}</span>
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
