import { useState } from 'react'
import { getAvatar } from '../utils/avatar'

import { getLanguageLabel } from '../utils/i18n'

export default function MenuPage({
  onTabChange,
  onNavigate,
  currentUser,
  theme,
  onToggleTheme,
  onLogout,
  onNavigateToLanguage,
  language,
  t,
}) {
  const tx = t || ((value) => value)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const activeLanguage = getLanguageLabel(language)

  const menuItems = [
    {
      id: 'home',
      label: tx('Home'),
      icon: 'fa-solid fa-house',
      action: () => onTabChange('home'),
    },
    {
      id: 'challenges',
      label: tx('Clips'),
      icon: 'fa-solid fa-paperclip',
      action: () => onTabChange('challenges'),
    },
    {
      id: 'notifications',
      label: tx('Notifications'),
      icon: 'fa-solid fa-bell',
      action: () => onTabChange('notifications'),
    },
    {
      id: 'messages',
      label: tx('Messages'),
      icon: 'fa-solid fa-comments',
      action: () => onTabChange('messages'),
    },
    {
      id: 'people',
      label: tx('People'),
      icon: 'fa-solid fa-users',
      action: () => onTabChange('people'),
    },
  ]

  const settingsItems = [
    {
      id: 'settings',
      label: tx('Edit Profile'),
      icon: 'fa-solid fa-user',
      action: () => onNavigate('settings'),
    },
    {
      id: 'theme',
      label: theme === 'dark' ? tx('Dark') : tx('Light'),
      icon: theme === 'dark' ? 'fa-solid fa-moon' : 'fa-solid fa-sun',
      action: () => onToggleTheme?.(),
    },
    {
      id: 'language',
      label: `${tx('Language')}: ${activeLanguage}`,
      icon: 'fa-solid fa-globe',
      action: () => onNavigateToLanguage?.(),
    },
  ]

  return (
    <section className="menu-page">
      <div className="menu-container">
        <div className="menu-header">
          <h2>{tx('Menu')}</h2>
          <p>{tx('Quick access to features')}</p>
        </div>

        {/* User Info Card */}
        <button
          type="button"
          className="menu-user-card-btn"
          onClick={() => onTabChange('profile')}
          aria-label={`View ${currentUser.name}'s profile`}
        >
          <img src={getAvatar(currentUser)} alt={currentUser.name} />
          <div>
            <h4>{currentUser.name}</h4>
            <p>{currentUser.email}</p>
          </div>
        </button>

        {/* Navigation Menu */}
        <div className="menu-section">
          <h3 className="menu-section-title">{tx('Navigation')}</h3>
          <nav className="menu-list">
            {menuItems.map((item) => (
              <button
                key={item.id}
                className="menu-item"
                onClick={item.action}
              >
                <i className={item.icon} aria-hidden="true" />
                <span>{item.label}</span>
                <i className="fa-solid fa-chevron-right" aria-hidden="true" />
              </button>
            ))}
          </nav>
        </div>

        {/* Settings Section */}
        <div className="menu-section">
          <h3 className="menu-section-title">{tx('Settings')}</h3>
          <div className="menu-list">
            <button
              type="button"
              className="menu-item menu-item-parent"
              onClick={() => setIsSettingsOpen((open) => !open)}
              aria-expanded={isSettingsOpen}
              aria-controls="menu-settings-sublist"
            >
              <i className="fa-solid fa-gear" aria-hidden="true" />
              <span>{tx('Settings')}</span>
              <i
                className={`fa-solid ${isSettingsOpen ? 'fa-chevron-up' : 'fa-chevron-down'}`}
                aria-hidden="true"
              />
            </button>

            {isSettingsOpen ? (
              <nav id="menu-settings-sublist" className="menu-sublist" aria-label="Settings options">
                {settingsItems.map((item) => (
                  <button
                    key={item.id}
                    className="menu-item menu-subitem"
                    onClick={item.action}
                  >
                    <i className={item.icon} aria-hidden="true" />
                    <span>{item.label}</span>
                    <i className="fa-solid fa-chevron-right" aria-hidden="true" />
                  </button>
                ))}
              </nav>
            ) : null}
          </div>
        </div>

        {/* Logout Button */}
        <button
          className="btn-danger menu-logout"
          onClick={() => {
            if (confirm('Are you sure you want to log out?')) {
              onLogout?.()
            }
          }}
        >
          <i className="fa-solid fa-sign-out-alt" aria-hidden="true" /> {tx('Log Out')}
        </button>
      </div>
    </section>
  )
}
