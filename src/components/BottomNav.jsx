const navItems = [
  { id: 'home', label: 'Home', icon: 'fa-solid fa-house' },
  { id: 'challenges', label: 'Challenges', icon: 'fa-solid fa-microphone-lines' },
  { id: 'notifications', label: 'Notifications', icon: 'fa-solid fa-bell' },
  { id: 'messages', label: 'Messages', icon: 'fa-solid fa-comments' },
  { id: 'profile', label: 'Profile', icon: 'fa-solid fa-user' },
]

export default function BottomNav({ activeTab, onTabChange }) {
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
