export default function NotificationsPage({ currentUser, users, posts, messages }) {
  const receivedMessages = messages
    .filter((message) => message.toUserId === currentUser.id)
    .slice(-6)
    .reverse()

  const votedChallenges = posts
    .filter((post) => post.userId === currentUser.id && post.challengeVotes > 0)
    .slice(0, 6)

  return (
    <section className="basic-page">
      <h2>Notifications</h2>
      <p className="subtitle">Recent updates about your account activity.</p>

      <div className="leaderboard-list">
        {receivedMessages.map((message) => {
          const sender = users.find((user) => user.id === message.fromUserId)
          return (
            <article key={`message-${message.id}`} className="leaderboard-item">
              <span className="rank">
                <i className="fa-solid fa-envelope" aria-hidden="true" />
              </span>
              <img src={sender?.avatar} alt={sender?.name} className="post-avatar" />
              <div className="leaderboard-user">
                <strong>{sender?.name || 'Someone'} sent you a message</strong>
                <p>{message.text}</p>
              </div>
            </article>
          )
        })}

        {votedChallenges.map((post) => (
          <article key={`vote-${post.id}`} className="leaderboard-item">
            <span className="rank">
              <i className="fa-solid fa-thumbs-up" aria-hidden="true" />
            </span>
            <img src={currentUser.avatar} alt={currentUser.name} className="post-avatar" />
            <div className="leaderboard-user">
              <strong>Your challenge received votes</strong>
              <p>
                {post.challengeTitle}: {post.challengeVotes} vote(s)
              </p>
            </div>
          </article>
        ))}

        {!receivedMessages.length && !votedChallenges.length ? (
          <p className="empty-message">No notifications yet.</p>
        ) : null}
      </div>
    </section>
  )
}