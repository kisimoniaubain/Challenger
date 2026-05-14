import { useEffect, useState } from 'react'

export default function SettingsPage({ currentUser, onLogout, onDeleteAccount, t }) {
  const tx = t || ((value) => value)
  const [editMode, setEditMode] = useState(false)
  const [name, setName] = useState(currentUser.name)
  const [email, setEmail] = useState(currentUser.email)
  const [dataMode, setDataMode] = useState('checking')

  useEffect(() => {
    let cancelled = false

    fetch('/api/health')
      .then((response) => response.json())
      .then((payload) => {
        if (cancelled) {
          return
        }

        const nextMode = String(payload?.dataMode || 'unknown').toLowerCase()
        setDataMode(nextMode)
      })
      .catch(() => {
        if (!cancelled) {
          setDataMode('offline')
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  const handleSaveProfile = () => {
    // In a real app, this would update the user profile
    setEditMode(false)
    alert(`${tx('Save Changes')}!`)
  }

  return (
    <section className="settings-page">
      <div className="settings-container">
        <h2>{tx('Settings')}</h2>
        <p className="subtitle">{tx('Manage your account and preferences')}</p>
        <p className="settings-data-mode">
          <span className={`settings-mode-badge mode-${dataMode}`}>
            Data mode: {dataMode}
          </span>
        </p>

        {/* Account Section */}
        <div className="settings-section">
          <h3 className="settings-section-title">
            <i className="fa-solid fa-user" aria-hidden="true" /> {tx('Account')}
          </h3>

          {editMode ? (
            <div className="settings-form">
              <div className="form-group">
                <label htmlFor="name">{tx('Name')}</label>
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label htmlFor="email">{tx('Email')}</label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="form-input"
                />
              </div>
              <div className="form-actions">
                <button className="btn-primary" onClick={handleSaveProfile}>
                  {tx('Save Changes')}
                </button>
                <button className="btn-secondary" onClick={() => setEditMode(false)}>
                  {tx('Cancel')}
                </button>
              </div>
            </div>
          ) : (
            <div className="settings-info">
              <p>
                <strong>{tx('Name')}:</strong> {currentUser.name}
              </p>
              <p>
                <strong>{tx('Email')}:</strong> {currentUser.email}
              </p>
              <button
                className="btn-secondary"
                onClick={() => setEditMode(true)}
              >
                <i className="fa-solid fa-edit" aria-hidden="true" /> {tx('Edit Profile')}
              </button>
            </div>
          )}
        </div>

        {/* Privacy & Security */}
        <div className="settings-section">
          <h3 className="settings-section-title">
            <i className="fa-solid fa-lock" aria-hidden="true" /> {tx('Privacy & Security')}
          </h3>
          <div className="settings-info">
            <p>
              <strong>Privacy:</strong> Your profile is public. Your posts and votes are visible to all users.
            </p>
            <p className="option-desc">
              To change privacy settings, contact support or enable private mode.
            </p>
          </div>
        </div>

        {/* About */}
        <div className="settings-section">
          <h3 className="settings-section-title">
            <i className="fa-solid fa-info-circle" aria-hidden="true" /> {tx('About')}
          </h3>
          <div className="settings-info">
            <p>
              <strong className="brand-inline">
                <span className="brand-mark" aria-hidden="true">C</span>
                <span className="brand-word">Challenger</span>
              </strong>{' '}
              v1.0
            </p>
            <p className="option-desc">
              A Facebook-like social platform for music challenges and voting.
            </p>
          </div>
        </div>

        {/* Danger Zone */}
        <div className="settings-section danger-zone">
          <h3 className="settings-section-title">
            <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" /> {tx('Danger Zone')}
          </h3>
          <p className="option-desc">Irreversible actions</p>
          <button
            className="btn-danger"
            onClick={() => {
              if (confirm('This will permanently delete your account, posts, stories, and messages. Continue?')) {
                onDeleteAccount?.()
              }
            }}
          >
            <i className="fa-solid fa-user-slash" aria-hidden="true" /> {tx('Delete My Account')}
          </button>
          <button
            className="btn-danger"
            onClick={() => {
              if (confirm('Are you sure you want to log out?')) {
                onLogout()
              }
            }}
          >
            <i className="fa-solid fa-sign-out-alt" aria-hidden="true" /> {tx('Log Out')}
          </button>
        </div>
      </div>
    </section>
  )
}
