import { useMemo, useState } from 'react'

export default function MessagesPage({
  currentUser,
  users,
  messages,
  selectedChatUserId,
  onSelectChat,
  onSendMessage,
  onEditMessage,
  onDeleteMessage,
  onNavigateToProfile,
  t,
}) {
  const tx = t || ((value) => value)
  const [draft, setDraft] = useState('')

  const contacts = useMemo(
    () => users.filter((user) => user.id !== currentUser.id),
    [currentUser.id, users],
  )

  const activeContact =
    contacts.find((user) => user.id === selectedChatUserId) || contacts[0] || null

  const threadMessages = useMemo(() => {
    if (!activeContact) {
      return []
    }

    return messages.filter(
      (message) =>
        (message.fromUserId === currentUser.id && message.toUserId === activeContact.id) ||
        (message.fromUserId === activeContact.id && message.toUserId === currentUser.id),
    )
  }, [activeContact, currentUser.id, messages])

  function handleSubmit(event) {
    event.preventDefault()
    const nextMessage = draft.trim()

    if (!nextMessage || !activeContact) {
      return
    }

    onSendMessage(activeContact.id, nextMessage)
    setDraft('')
  }

  return (
    <section className="messages-page" aria-label={tx('Messages')}>
      <aside className="messages-sidebar">
        <div className="messages-sidebar-head">
          <h2>{tx('Chats')}</h2>
          <p>Message other challengers like Facebook.</p>
        </div>

        <div className="messages-contact-list">
          {contacts.map((contact) => {
            const latestMessage = [...messages]
              .reverse()
              .find(
                (message) =>
                  (message.fromUserId === currentUser.id && message.toUserId === contact.id) ||
                  (message.fromUserId === contact.id && message.toUserId === currentUser.id),
              )

            return (
              <button
                key={contact.id}
                type="button"
                className={`messages-contact ${activeContact?.id === contact.id ? 'active' : ''}`}
                onClick={() => onSelectChat(contact.id)}
              >
                <img src={contact.avatar} alt={contact.name} className="messages-contact-avatar" />
                <div className="messages-contact-copy">
                  <strong>{contact.name}</strong>
                  <p>{latestMessage?.text || 'Start a conversation'}</p>
                </div>
              </button>
            )
          })}
        </div>
      </aside>

      <div className="messages-thread-shell">
        {activeContact ? (
          <>
            <header className="messages-thread-head">
              <button
                type="button"
                className="messages-thread-user-btn"
                onClick={() => onNavigateToProfile?.(activeContact.id)}
                aria-label={`View ${activeContact.name} profile`}
              >
                <img
                  src={activeContact.avatar}
                  alt={activeContact.name}
                  className="messages-thread-avatar"
                />
                <div>
                  <h3>{activeContact.name}</h3>
                  <p>{activeContact.email}</p>
                </div>
              </button>
            </header>

            <div className="messages-thread-body">
              {threadMessages.map((message) => {
                const isMine = message.fromUserId === currentUser.id
                return (
                  <article
                    key={message.id}
                    className={`message-bubble ${isMine ? 'mine' : 'theirs'}`}
                  >
                    {isMine ? (
                      <div className="message-bubble-actions">
                        <button
                          type="button"
                          onClick={() => {
                            const nextText = window.prompt('Edit your message', message.text)
                            if (nextText && nextText.trim()) {
                              onEditMessage(message.id, nextText.trim())
                            }
                          }}
                        >
                          <i className="fa-solid fa-pen" aria-hidden="true" />
                        </button>
                        <button type="button" onClick={() => onDeleteMessage(message.id)}>
                          <i className="fa-solid fa-trash" aria-hidden="true" />
                        </button>
                      </div>
                    ) : null}
                    <p>{message.text}</p>
                    <span>{message.timestamp}</span>
                  </article>
                )
              })}
            </div>

            <form className="messages-composer" onSubmit={handleSubmit}>
              <input
                type="text"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder={`Message ${activeContact.name}`}
              />
              <button type="submit">
                <i className="fa-solid fa-paper-plane" aria-hidden="true" />
                <span>{tx('Send')}</span>
              </button>
            </form>
          </>
        ) : (
          <div className="messages-empty-state">
            <i className="fa-regular fa-comments" aria-hidden="true" />
            <p>{tx('No contacts available yet.')}</p>
          </div>
        )}
      </div>
    </section>
  )
}