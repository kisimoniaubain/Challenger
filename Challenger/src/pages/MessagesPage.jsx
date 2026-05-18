import { useEffect, useMemo, useRef, useState } from 'react'
import { getAvatar } from '../utils/avatar'

const MESSAGE_EDIT_WINDOW_MS = 5 * 60 * 1000

export default function MessagesPage({
  currentUser,
  users,
  messages,
  selectedChatUserId,
  openThreadSignal,
  onSelectChat,
  onSendMessage,
  onEditMessage,
  onDeleteMessage,
  onForwardMessage,
  onNavigateToProfile,
  t,
}) {
  const tx = t || ((value) => value)
  const [draft, setDraft] = useState('')
  const [showThreadOnly, setShowThreadOnly] = useState(false)
  const [isConversationOpen, setIsConversationOpen] = useState(false)
  const [replyContext, setReplyContext] = useState(null)
  const composerInputRef = useRef(null)

  const contactIds = useMemo(() => {
    const ids = new Set()

    ;(messages || []).forEach((message) => {
      const isIncoming = message.toUserId === currentUser.id
      const isOutgoing = message.fromUserId === currentUser.id

      if (!isIncoming && !isOutgoing) {
        return
      }

      const peerId = isIncoming ? message.fromUserId : message.toUserId
      if (peerId && peerId !== currentUser.id) {
        ids.add(peerId)
      }
    })

    return ids
  }, [currentUser.id, messages])

  const contacts = useMemo(
    () => users.filter((user) => user.id !== currentUser.id && contactIds.has(user.id)),
    [contactIds, currentUser.id, users],
  )

  const activeContact =
    contacts.find((user) => user.id === selectedChatUserId) || contacts[0] || null

  useEffect(() => {
    if (!activeContact) {
      setShowThreadOnly(false)
      setIsConversationOpen(false)
    }
  }, [activeContact])

  useEffect(() => {
    if (openThreadSignal) {
      setShowThreadOnly(true)
      setIsConversationOpen(true)
    }
  }, [openThreadSignal])

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

  useEffect(() => {
    const inputElement = composerInputRef.current
    if (!inputElement) {
      return
    }

    inputElement.style.height = 'auto'
    inputElement.style.height = `${Math.min(inputElement.scrollHeight, 160)}px`
  }, [draft])

  function handleSubmit(event) {
    event.preventDefault()
    const nextMessage = draft.trim()

    if (!nextMessage || !activeContact) {
      return
    }

    onSendMessage(activeContact.id, nextMessage, replyContext ? {
      replyToMessageId: replyContext.messageId,
      replyToSenderName: replyContext.senderName,
      replyToText: replyContext.text,
    } : null)
    setDraft('')
    setReplyContext(null)
  }

  function handleSelectContact(contactId) {
    onSelectChat(contactId)
    setIsConversationOpen(true)
    setShowThreadOnly(true)
  }

  function canEditMessage(message) {
    const sentAtMs = Date.parse(String(message?.sentAt || ''))
    if (!Number.isFinite(sentAtMs)) {
      return false
    }

    return Date.now() - sentAtMs <= MESSAGE_EDIT_WINDOW_MS
  }

  function handleReplyToIncomingMessage(message) {
    if (!message || message.fromUserId === currentUser.id) {
      return
    }

    const senderName = activeContact?.name || 'User'
    const quotedText = String(message.text || '').trim()

    setReplyContext({
      messageId: message.id,
      senderName,
      text: quotedText,
    })

    window.requestAnimationFrame(() => {
      composerInputRef.current?.focus()
    })
  }

  function getMessageMinuteKey(message) {
    const sentAtMs = Date.parse(String(message?.sentAt || ''))
    if (Number.isFinite(sentAtMs)) {
      const dateValue = new Date(sentAtMs)
      return [
        dateValue.getFullYear(),
        dateValue.getMonth() + 1,
        dateValue.getDate(),
        dateValue.getHours(),
        dateValue.getMinutes(),
      ].join('-')
    }

    return String(message?.timestamp || '').trim().toLowerCase()
  }

  function handleForwardMessage(messageText) {
    const peers = users.filter((user) => user.id !== currentUser.id)
    const options = peers.map((user) => `${user.id}: ${user.name}`).join('\n')
    const pickedValue = window.prompt(`Forward to (enter user id):\n${options}`)
    const targetUserId = Number(pickedValue)

    if (!Number.isFinite(targetUserId) || targetUserId === currentUser.id) {
      return
    }

    const targetUser = peers.find((user) => user.id === targetUserId)
    if (!targetUser) {
      return
    }

    onForwardMessage?.(targetUserId, messageText)
  }

  return (
    <section
      className={`messages-page ${showThreadOnly ? 'thread-only' : ''} ${!isConversationOpen ? 'list-only' : ''}`}
      aria-label={tx('Messages')}
    >
      <aside className="messages-sidebar">
        <div className="messages-sidebar-head">
          <h2>{tx('Chats')}</h2>
          <p>{tx('Chat with other challenger')}</p>
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
                onClick={() => handleSelectContact(contact.id)}
              >
                <img src={getAvatar(contact)} alt={contact.name} className="messages-contact-avatar" />
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
        {activeContact && isConversationOpen ? (
          <>
            <header className="messages-thread-head">
              {showThreadOnly ? (
                <button
                  type="button"
                  className="messages-back-btn"
                  onClick={() => {
                    setShowThreadOnly(false)
                    setIsConversationOpen(false)
                  }}
                  aria-label={tx('Back to chats')}
                >
                  <i className="fa-solid fa-arrow-left" aria-hidden="true" />
                </button>
              ) : null}

              <button
                type="button"
                className="messages-thread-user-btn"
                onClick={() => onNavigateToProfile?.(activeContact.id)}
                aria-label={`View ${activeContact.name} profile`}
              >
                <img
                  src={getAvatar(activeContact)}
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
              {threadMessages.map((message, index) => {
                const isMine = message.fromUserId === currentUser.id
                const canEdit = isMine && canEditMessage(message)
                const previousMessage = threadMessages[index - 1]
                const isGroupedWithPrevious = Boolean(
                  previousMessage
                  && previousMessage.fromUserId === message.fromUserId
                  && getMessageMinuteKey(previousMessage) === getMessageMinuteKey(message),
                )

                return (
                  <article
                    key={message.id}
                    className={`message-bubble ${isMine ? 'mine' : 'theirs'} ${isGroupedWithPrevious ? 'is-grouped' : ''}`}
                    onClick={() => {
                      if (!isMine) {
                        handleReplyToIncomingMessage(message)
                      }
                    }}
                  >
                    <div
                      className="message-bubble-actions"
                      onClick={(event) => event.stopPropagation()}
                    >
                      {isMine && canEdit ? (
                        <button
                          type="button"
                          onClick={() => {
                            const nextText = window.prompt('Edit your message', message.text)
                            if (nextText && nextText.trim()) {
                              onEditMessage(message.id, nextText.trim())
                            }
                          }}
                          aria-label="Edit message"
                          title="Edit"
                        >
                          <i className="fa-solid fa-pen" aria-hidden="true" />
                        </button>
                      ) : null}

                      <button
                        type="button"
                        onClick={() => handleForwardMessage(message.text)}
                        aria-label="Forward message"
                        title="Forward"
                      >
                        <i className="fa-solid fa-share" aria-hidden="true" />
                      </button>

                      {isMine ? (
                        <button
                          type="button"
                          onClick={() => onDeleteMessage(message.id)}
                          aria-label="Delete message"
                          title="Delete"
                        >
                          <i className="fa-solid fa-trash" aria-hidden="true" />
                        </button>
                      ) : null}
                    </div>

                    {message.replyToText ? (
                      <div className={`message-replied-snippet ${isMine ? 'mine' : 'theirs'}`}>
                        <strong>{message.replyToSenderName || 'Reply'}</strong>
                        <p>{message.replyToText}</p>
                      </div>
                    ) : null}

                    <div className={`message-text-pill ${isMine ? 'mine' : 'theirs'}`}>
                      <p>{message.text}</p>
                    </div>

                    <span className="message-bubble-time">{message.timestamp}</span>
                  </article>
                )
              })}
            </div>

            <form className="messages-composer" onSubmit={handleSubmit}>
              {replyContext ? (
                <div className="messages-reply-context">
                  <strong>Replying to {replyContext.senderName}</strong>
                  <p>{replyContext.text}</p>
                  <button
                    type="button"
                    aria-label="Cancel reply"
                    onClick={() => {
                      setReplyContext(null)
                    }}
                  >
                    <i className="fa-solid fa-xmark" aria-hidden="true" />
                  </button>
                </div>
              ) : null}

              <textarea
                ref={composerInputRef}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    event.currentTarget.form?.requestSubmit()
                  }
                }}
                placeholder={`Message ${activeContact.name}`}
                rows={1}
              />
              <button type="submit" aria-label={tx('Send')} title={tx('Send')}>
                <i className="fa-solid fa-paper-plane" aria-hidden="true" />
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