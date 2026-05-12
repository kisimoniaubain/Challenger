export default function NotificationsPage({ currentUser, users, posts, messages, notifications = [] }) {
  const timelineNotifications = notifications
    .filter((item) => item.targetUserId === currentUser.id)
    .slice(0, 40)

  const receivedMessages = messages
    .filter((message) => message.toUserId === currentUser.id)
    .slice(-6)
    .reverse()

  const votedChallenges = posts
    .filter((post) => post.userId === currentUser.id && post.challengeVotes > 0)
    .slice(0, 6)

  function getNotificationView(item) {
    const actor = users.find((user) => user.id === item.actorId)

    if (item.type === 'like') {
      return {
        icon: 'fa-solid fa-heart',
        title: `${actor?.name || 'Someone'} liked your post`,
        detail: item.challengeTitle || 'Your post received a new like.',
        avatar: actor?.avatar || currentUser.avatar,
      }
    }

    if (item.type === 'comment') {
      return {
        icon: 'fa-solid fa-comment',
        title: `${actor?.name || 'Someone'} commented on your post`,
        detail: item.challengeTitle || 'Your post received a new comment.',
        avatar: actor?.avatar || currentUser.avatar,
      }
    }

    if (item.type === 'vote') {
      return {
        icon: 'fa-solid fa-thumbs-up',
        title: `${actor?.name || 'Someone'} voted for your challenge`,
        detail: item.challengeTitle || 'Your challenge got a new vote.',
        avatar: actor?.avatar || currentUser.avatar,
      }
    }

    if (item.type === 'new-challenge') {
      return {
        icon: 'fa-solid fa-microphone-lines',
        title: `${actor?.name || 'Someone'} posted a new challenge`,
        detail: item.challengeTitle || 'New challenge available.',
        avatar: actor?.avatar || currentUser.avatar,
      }
    }

    return {
      icon: 'fa-solid fa-bell',
      title: 'New notification',
      detail: 'You have an update.',
      avatar: currentUser.avatar,
    }
  }

  return (
    <section className="basic-page">
      <h2>Notifications</h2>
      <p className="subtitle">Recent updates about your account activity.</p>

      <div className="leaderboard-list">
        {timelineNotifications.map((item) => {
          const view = getNotificationView(item)
          return (
            <article key={`activity-${item.id}`} className="leaderboard-item">
              <span className="rank">
                <i className={view.icon} aria-hidden="true" />
              </span>
              <img src={view.avatar} alt={view.title} className="post-avatar" />
              <div className="leaderboard-user">
                <strong>{view.title}</strong>
                <p>{view.detail}</p>
              </div>
            </article>
          )
        })}

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

        {!timelineNotifications.length && !receivedMessages.length && !votedChallenges.length ? (
          <p className="empty-message">No notifications yet.</p>
        ) : null}
      </div>
    </section>
  )
}