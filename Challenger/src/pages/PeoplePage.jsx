import { useMemo, useState } from 'react'
import { getAvatar } from '../utils/avatar'

export default function PeoplePage({
  currentUser,
  users,
  followGraph,
  onToggleFollowUser,
  onNavigateToProfile,
  t,
}) {
  const tx = t || ((value) => value)
  const [activeFilter, setActiveFilter] = useState('all')

  const filters = [
    { key: 'all', label: tx('People') },
    { key: 'followers', label: tx('Followers') },
    { key: 'following', label: tx('Following') },
  ]

  const followingIds = useMemo(() => {
    return Array.isArray(followGraph?.[currentUser.id]) ? followGraph[currentUser.id] : []
  }, [followGraph, currentUser.id])

  const followerIds = useMemo(() => {
    return (users || [])
      .filter((user) => user.id !== currentUser.id)
      .filter((user) => Array.isArray(followGraph?.[user.id]) && followGraph[user.id].includes(currentUser.id))
      .map((user) => user.id)
  }, [users, followGraph, currentUser.id])

  const allPeople = useMemo(() => {
    return (users || []).filter((user) => user.id !== currentUser.id)
  }, [users, currentUser.id])

  const filteredUsers = useMemo(() => {
    if (activeFilter === 'followers') {
      return allPeople.filter((user) => followerIds.includes(user.id))
    }

    if (activeFilter === 'following') {
      return allPeople.filter((user) => followingIds.includes(user.id))
    }

    return allPeople
  }, [activeFilter, allPeople, followerIds, followingIds])

  return (
    <section className="basic-page people-page" aria-label={tx('People')}>
      <div className="people-head">
        <h2>{tx('People')}</h2>
        <div className="people-summary">
          <span className="people-pill">{tx('Followers')} {followerIds.length}</span>
          <span className="people-pill">{tx('Following')} {followingIds.length}</span>
        </div>
      </div>

      <div className="people-filter-row" role="tablist" aria-label={tx('People')}>
        {filters.map((filter) => (
          <button
            key={filter.key}
            type="button"
            role="tab"
            aria-selected={activeFilter === filter.key}
            className={`people-filter-btn ${activeFilter === filter.key ? 'active' : ''}`}
            onClick={() => setActiveFilter(filter.key)}
          >
            {filter.label}
          </button>
        ))}
      </div>

      <div className="leaderboard-list">
        {filteredUsers.map((user) => {
          const isFollowing = followingIds.includes(user.id)

          return (
            <article key={user.id} className="leaderboard-item people-list-item">
              <button
                type="button"
                className="people-profile-btn"
                onClick={() => onNavigateToProfile?.(user.id)}
              >
                <img src={getAvatar(user)} alt={user.name} className="post-avatar" />
                <div className="leaderboard-user">
                  <strong>{user.name}</strong>
                  <p>{user.email || 'Challenger account'}</p>
                </div>
              </button>

              <button
                type="button"
                className={`people-follow-btn ${isFollowing ? 'is-following' : ''}`}
                onClick={() => onToggleFollowUser?.(user.id)}
              >
                {isFollowing ? tx('Following') : tx('Follow')}
              </button>
            </article>
          )
        })}

        {!filteredUsers.length ? (
          <p className="empty-message">No users in this section yet.</p>
        ) : null}
      </div>
    </section>
  )
}
