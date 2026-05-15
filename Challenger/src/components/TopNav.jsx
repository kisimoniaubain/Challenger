import { useEffect, useRef, useState } from 'react'
import { getAvatar } from '../utils/avatar'

export default function TopNav({
  currentUser,
  activeTab,
  onTabChange,
  users,
  posts,
  badgeCounts = {},
  onNavigateToProfile,
  onNavigateToMenu,
  onSearchQueryChange,
  t,
}) {
  const tx = t || ((value) => value)
  const tabItems = [
    { id: 'home', label: tx('Home'), icon: 'fa-solid fa-house' },
    { id: 'challenges', label: tx('Clips'), icon: 'fa-solid fa-paperclip' },
    { id: 'notifications', label: tx('Notifications'), icon: 'fa-solid fa-bell' },
    { id: 'messages', label: tx('Messages'), icon: 'fa-solid fa-comments' },
  ]
  const [searchQuery, setSearchQuery] = useState('')
  const [showSearchResults, setShowSearchResults] = useState(false)
  const searchWrapRef = useRef(null)

  const normalizedQuery = searchQuery.trim().toLowerCase()
  const trimmedQuery = searchQuery.trim()
  const userMatches = normalizedQuery
    ? (users || [])
        .filter(
          (user) =>
            String(user.name || '').toLowerCase().includes(normalizedQuery) ||
            String(user.email || '').toLowerCase().includes(normalizedQuery),
        )
        .slice(0, 5)
    : []

  const challengeMatches = normalizedQuery
    ? (posts || [])
        .filter(
          (post) =>
            (String(post.challengeTitle || '').toLowerCase().includes(normalizedQuery) ||
            String(post.text || '').toLowerCase().includes(normalizedQuery)),
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
    onSearchQueryChange?.('')
  }

  function handleSearchChallengeClick(post) {
    const nextQuery = String(post?.challengeTitle || post?.text || trimmedQuery).trim()
    onSearchQueryChange?.(nextQuery)
    onTabChange('challenges')
    setShowSearchResults(false)
  }

  function handleSearchSubmit(event) {
    event.preventDefault()
    if (!trimmedQuery) {
      return
    }

    if (userMatches.length > 0) {
      handleSearchUserClick(userMatches[0].id)
      return
    }

    onSearchQueryChange?.(trimmedQuery)
    onTabChange('challenges')
    setShowSearchResults(false)
  }

  function handleClearSearch() {
    setSearchQuery('')
    setShowSearchResults(false)
    onSearchQueryChange?.('')
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
            <img src="/avatars/challenger.png" alt="Challenger logo" className="brand-logo-img" />
          </button>
          <span className="brand-word brand-word-header">Challenger</span>
        </div>

        <div className="top-search-row">
          <form className="top-search-pill" ref={searchWrapRef} onSubmit={handleSearchSubmit}>
            <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
            <input
              className="top-search-input"
              type="search"
              placeholder={tx('Search people and challenges')}
              value={searchQuery}
              onChange={(event) => {
                setSearchQuery(event.target.value)
                setShowSearchResults(true)
              }}
              onFocus={() => setShowSearchResults(true)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  setShowSearchResults(false)
                }
              }}
              aria-label={tx('Search people and challenges')}
            />

            {trimmedQuery ? (
              <button
                type="button"
                className="top-search-clear-btn"
                onClick={handleClearSearch}
                aria-label="Clear search"
                title="Clear"
              >
                <i className="fa-solid fa-xmark" aria-hidden="true" />
              </button>
            ) : null}

            {showSearchResults && normalizedQuery ? (
              <div className="top-search-results" role="listbox" aria-label="Search results">
                {userMatches.length > 0 ? <p className="top-search-section-title">People</p> : null}
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

                {challengeMatches.length > 0 ? <p className="top-search-section-title">Posts & Challenges</p> : null}
                {challengeMatches.map((post) => (
                  <button
                    key={`post-${post.id}`}
                    type="button"
                    className="top-search-item"
                    onClick={() => handleSearchChallengeClick(post)}
                  >
                    <span className="top-search-badge">
                      <i className="fa-solid fa-microphone-lines" aria-hidden="true" />
                    </span>
                    <div>
                      <strong>{post.challengeTitle || tx('Challenges')}</strong>
                      <p>{(post.text || tx('Active Challenges')).slice(0, 55)}</p>
                    </div>
                  </button>
                ))}

                <button
                  type="submit"
                  className="top-search-view-all-btn"
                >
                  Search for "{trimmedQuery}"
                </button>

                {!userMatches.length && !challengeMatches.length ? (
                  <p className="top-search-empty">{tx('No results found.')}</p>
                ) : null}
              </div>
            ) : null}
          </form>

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

            <button className="icon-btn" type="button" aria-label="People" onClick={() => onTabChange('people')}>
              <i className="fa-solid fa-users" aria-hidden="true" />
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
        {tabItems.map((item) => {
          const iconBadgeCount = Number(badgeCounts?.[item.id]) || 0

          return (
            <button
              key={item.id}
              type="button"
              className={`top-tab-btn ${activeTab === item.id ? 'active' : ''}`}
              onClick={() => onTabChange(item.id)}
              aria-current={activeTab === item.id ? 'page' : undefined}
            >
              <span className="nav-icon-with-badge">
                <i className={`top-tab-icon ${item.icon}`} aria-hidden="true" />
                {iconBadgeCount > 0 && activeTab !== item.id ? (
                  <span className="nav-count-badge" aria-label={`${iconBadgeCount} new ${item.label.toLowerCase()}`}>
                    {iconBadgeCount > 99 ? '99+' : iconBadgeCount}
                  </span>
                ) : null}
              </span>
              <span className="top-tab-label">{item.label}</span>
              {activeTab === item.id && <span className="top-tab-underline" />}
            </button>
          )
        })}
      </nav>
    </header>
  )
}
