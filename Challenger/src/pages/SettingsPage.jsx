import { useState } from 'react'

export default function SettingsPage({ currentUser, onLogout, onDeleteAccount }) {
  const [editMode, setEditMode] = useState(false)
  const [name, setName] = useState(currentUser.name)
  const [email, setEmail] = useState(currentUser.email)

  const handleSaveProfile = () => {
    // In a real app, this would update the user profile
    setEditMode(false)
    alert('Profile updated! (This is a demo)')
  }

  return (
    <section className="settings-page">
      <div className="settings-container">
        <h2>Settings</h2>
        <p className="subtitle">Manage your account and preferences</p>

        {/* Account Section */}
        <div className="settings-section">
          <h3 className="settings-section-title">
            <i className="fa-solid fa-user" aria-hidden="true" /> Account
          </h3>

          {editMode ? (
            <div className="settings-form">
              <div className="form-group">
                <label htmlFor="name">Name</label>
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label htmlFor="email">Email</label>
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
                  Save Changes
                </button>
                <button className="btn-secondary" onClick={() => setEditMode(false)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="settings-info">
              <p>
                <strong>Name:</strong> {currentUser.name}
              </p>
              <p>
                <strong>Email:</strong> {currentUser.email}
              </p>
              <button
                className="btn-secondary"
                onClick={() => setEditMode(true)}
              >
                <i className="fa-solid fa-edit" aria-hidden="true" /> Edit Profile
              </button>
            </div>
          )}
        </div>

        {/* Privacy & Security */}
        <div className="settings-section">
          <h3 className="settings-section-title">
            <i className="fa-solid fa-lock" aria-hidden="true" /> Privacy & Security
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
            <i className="fa-solid fa-info-circle" aria-hidden="true" /> About
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
            <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" /> Danger Zone
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
            <i className="fa-solid fa-user-slash" aria-hidden="true" /> Delete My Account
          </button>
          <button
            className="btn-danger"
            onClick={() => {
              if (confirm('Are you sure you want to log out?')) {
                onLogout()
              }
            }}
          >
            <i className="fa-solid fa-sign-out-alt" aria-hidden="true" /> Log Out
          </button>
        </div>
      </div>
    </section>
  )
}
