export default function MenuPage({ onTabChange, onNavigate, currentUser, theme, onToggleTheme }) {
  const menuItems = [
    {
      id: 'home',
      label: 'Home',
      icon: 'fa-solid fa-house',
      action: () => onTabChange('home'),
    },
    {
      id: 'challenges',
      label: 'Challenges',
      icon: 'fa-solid fa-microphone-lines',
      action: () => onTabChange('challenges'),
    },
    {
      id: 'notifications',
      label: 'Notifications',
      icon: 'fa-solid fa-bell',
      action: () => onTabChange('notifications'),
    },
    {
      id: 'messages',
      label: 'Messages',
      icon: 'fa-solid fa-comments',
      action: () => onTabChange('messages'),
    },
    {
      id: 'profile',
      label: 'Profile',
      icon: 'fa-solid fa-user',
      action: () => onTabChange('profile'),
    },
  ]

  const settingsItems = [
    {
      id: 'settings',
      label: 'Settings',
      icon: 'fa-solid fa-gear',
      action: () => onNavigate('settings'),
    },
    {
      id: 'theme',
      label: `Theme: ${theme === 'dark' ? 'Dark' : 'Light'}`,
      icon: 'fa-solid fa-palette',
      action: () => onToggleTheme?.(),
    },
  ]

  return (
    <section className="menu-page">
      <div className="menu-container">
        <div className="menu-header">
          <h2>Menu</h2>
          <p>Quick access to features</p>
        </div>

        {/* Navigation Menu */}
        <div className="menu-section">
          <h3 className="menu-section-title">Navigation</h3>
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
          <h3 className="menu-section-title">Settings</h3>
          <nav className="menu-list">
            {settingsItems.map((item) => (
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

        {/* User Info Card */}
        <div className="menu-user-card">
          <img src={currentUser.avatar} alt={currentUser.name} />
          <div>
            <h4>{currentUser.name}</h4>
            <p>{currentUser.email}</p>
          </div>
        </div>
      </div>
    </section>
  )
}
