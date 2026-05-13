export default function BottomNav({ activeTab, onTabChange, t }) {
  const tx = t || ((value) => value)
  const navItems = [
    { id: 'home', label: tx('Home'), icon: 'fa-solid fa-house' },
    { id: 'challenges', label: tx('Clips'), icon: 'fa-solid fa-paperclip' },
    { id: 'notifications', label: tx('Notifications'), icon: 'fa-solid fa-bell' },
    { id: 'messages', label: tx('Messages'), icon: 'fa-solid fa-comments' },
  ]

  return (
    <nav className="bottom-nav" aria-label="Bottom navigation">
      {navItems.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`bottom-nav-item ${activeTab === item.id ? 'active' : ''}`}
          onClick={() => onTabChange(item.id)}
        >
          <i className={`bottom-nav-icon ${item.icon}`} aria-hidden="true" />
          <span className="bottom-nav-label">{item.label}</span>
        </button>
      ))}
    </nav>
  )
}
