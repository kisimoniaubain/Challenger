export default function BottomNav({ activeTab, onTabChange, badgeCounts = {}, t }) {
  const tx = t || ((value) => value)
  const navItems = [
    { id: 'home', label: tx('Home'), icon: 'fa-solid fa-house' },
    { id: 'challenges', label: tx('Clips'), icon: 'fa-solid fa-paperclip' },
    { id: 'notifications', label: tx('Notifications'), icon: 'fa-solid fa-bell' },
    { id: 'messages', label: tx('Messages'), icon: 'fa-solid fa-comments' },
  ]

  return (
    <nav className="bottom-nav" aria-label="Bottom navigation">
      {navItems.map((item) => {
        const iconBadgeCount = Number(badgeCounts?.[item.id]) || 0

        return (
          <button
            key={item.id}
            type="button"
            className={`bottom-nav-item ${activeTab === item.id ? 'active' : ''}`}
            onClick={() => onTabChange(item.id)}
          >
            <span className="nav-icon-with-badge">
              <i className={`bottom-nav-icon ${item.icon}`} aria-hidden="true" />
              {iconBadgeCount > 0 && activeTab !== item.id ? (
                <span className="nav-count-badge" aria-label={`${iconBadgeCount} new ${item.label.toLowerCase()}`}>
                  {iconBadgeCount > 99 ? '99+' : iconBadgeCount}
                </span>
              ) : null}
            </span>
            <span className="bottom-nav-label">{item.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
