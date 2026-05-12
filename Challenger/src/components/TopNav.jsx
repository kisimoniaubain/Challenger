import { useEffect, useRef, useState } from 'react'
import { getAvatar } from '../utils/avatar'

const tabItems = [
  { id: 'home', label: 'Home', icon: 'fa-solid fa-house' },
  { id: 'challenges', label: 'Challenges', icon: 'fa-solid fa-microphone-lines' },
  { id: 'notifications', label: 'Notifications', icon: 'fa-solid fa-bell' },
  { id: 'messages', label: 'Messages', icon: 'fa-solid fa-comments' },
]

export default function TopNav({
  currentUser,
  activeTab,
  onTabChange,
  users,
  posts,
  onNavigateToProfile,
  onNavigateToMenu,
}) {
  const [searchQuery, setSearchQuery] = useState('')
  const [showSearchResults, setShowSearchResults] = useState(false)
  const searchWrapRef = useRef(null)

  const normalizedQuery = searchQuery.trim().toLowerCase()
  const userMatches = normalizedQuery
    ? (users || [])
        .filter(
          (user) =>
            user.name.toLowerCase().includes(normalizedQuery) ||
            user.email.toLowerCase().includes(normalizedQuery),
        )
        .slice(0, 5)
    : []

  const challengeMatches = normalizedQuery
    ? (posts || [])
        .filter(
          (post) =>
            (post.challengeTitle || '').toLowerCase().includes(normalizedQuery) ||
            (post.text || '').toLowerCase().includes(normalizedQuery),
        )
        .slice(0, 5)
    : []

  // Close search results when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (searchWrapRef.current && !searchWrapRef.current.contains(event.target)) {
        setShowSearchResults(false)
      }
    }

    if (showSearchResults) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showSearchResults])

  function handleSearchUserClick(userId) {
    onNavigateToProfile?.(userId)
    setSearchQuery('')
    setShowSearchResults(false)
  }

  function handleSearchChallengeClick() {
    onTabChange('challenges')
    setShowSearchResults(false)
  }

  return (
    <header className="top-nav">
      {/* Row 1: brand */}
      <div className="top-nav-main">
        <div className="top-brand-row">
          <button
            type="button"
            className="brand-c-badge"
            aria-label="Go to home"
            onClick={() => onTabChange('home')}
          >
            C
          </button>
          <span className="brand-word brand-word-header">Challenger</span>
        </div>

        <div className="top-search-row">
          <div className="top-search-pill" ref={searchWrapRef}>
            <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
            <input
              className="top-search-input"
              type="search"
              placeholder="Search people and challenges"
              value={searchQuery}
              onChange={(event) => {
                setSearchQuery(event.target.value)
                setShowSearchResults(true)
              }}
              onFocus={() => setShowSearchResults(true)}
              aria-label="Search people and challenges"
            />

            {showSearchResults && normalizedQuery ? (
              <div className="top-search-results" role="listbox" aria-label="Search results">
                {userMatches.map((user) => (
                  <button
                    key={`user-${user.id}`}
                    type="button"
                    className="top-search-item"
                    onClick={() => handleSearchUserClick(user.id)}
                  >
                    <img src={getAvatar(user)} alt={user.name} className="top-search-avatar" />
                    <div>
                      <strong>{user.name}</strong>
                      <p>{user.email}</p>
                    </div>
                  </button>
                ))}

                {challengeMatches.map((post) => (
                  <button
                    key={`post-${post.id}`}
                    type="button"
                    className="top-search-item"
                    onClick={handleSearchChallengeClick}
                  >
                    <span className="top-search-badge">
                      <i className="fa-solid fa-microphone-lines" aria-hidden="true" />
                    </span>
                    <div>
                      <strong>{post.challengeTitle || 'Challenge'}</strong>
                      <p>{(post.text || 'Open challenge').slice(0, 55)}</p>
                    </div>
                  </button>
                ))}

                {!userMatches.length && !challengeMatches.length ? (
                  <p className="top-search-empty">No results found.</p>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="top-nav-actions">
            <button
              className="icon-btn"
              type="button"
              aria-label="Menu"
              title="Menu"
              onClick={() => onNavigateToMenu?.()}
            >
              <i className="fa-solid fa-bars" aria-hidden="true" />
            </button>

            <button className="icon-btn" type="button" aria-label="Notifications" onClick={() => onTabChange('notifications')}>
              <i className="fa-solid fa-bell" aria-hidden="true" />
            </button>

            <button
              type="button"
              className="icon-btn avatar-icon-btn"
              aria-label="Open profile"
              onClick={() => onTabChange('profile')}
            >
              <img src={getAvatar(currentUser)} alt={currentUser?.name} className="top-user-avatar" />
            </button>
          </div>
        </div>
      </div>

      {/* Row 2: animated tab bar — hidden on small mobile (uses BottomNav instead) */}
      <nav className="top-tab-bar" aria-label="Main navigation">
        {tabItems.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`top-tab-btn ${activeTab === item.id ? 'active' : ''}`}
            onClick={() => onTabChange(item.id)}
            aria-current={activeTab === item.id ? 'page' : undefined}
          >
            <i className={`top-tab-icon ${item.icon}`} aria-hidden="true" />
            <span className="top-tab-label">{item.label}</span>
            {activeTab === item.id && <span className="top-tab-underline" />}
          </button>
        ))}
      </nav>
    </header>
  )
}
