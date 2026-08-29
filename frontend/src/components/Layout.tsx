import { useEffect, useState, useRef } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { api } from '@/services/api'
import type { Notification } from '@/lib/types'

const navItems = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/memos/inbox', label: 'Inbox' },
  { to: '/memos/mine', label: 'My Memos' },
  { to: '/memos/new', label: 'Create Memo' },
  { to: '/search', label: 'Search' },
]

export function Layout() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [bellOpen, setBellOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const bellRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let mounted = true
    async function load() {
      try {
        const res = await api.get('/notifications', { params: { limit: 10 } })
        if (mounted) {
          setNotifications(res.data.data.notifications)
          setUnreadCount(res.data.data.unreadCount)
        }
      } catch {
        // silent — notifications are non-critical
      }
    }
    load()
    const interval = setInterval(load, 30000)
    return () => {
      mounted = false
      clearInterval(interval)
    }
  }, [])

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) setBellOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  async function markRead(id: string) {
    await api.post(`/notifications/${id}/read`)
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)))
    setUnreadCount((c) => Math.max(0, c - 1))
  }

  async function handleLogout() {
    try {
      await api.post('/auth/logout')
    } catch {
      // best-effort audit entry; don't block sign-out on it
    }
    logout()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-gradient-to-r from-brand-600 to-teal-600 text-white sticky top-0 z-30 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between h-16">
          <div className="flex items-center gap-8">
            <button onClick={() => navigate('/')} className="font-bold text-xl tracking-tight">
              mr.memo
            </button>
            <nav className="hidden md:flex gap-1">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `px-3 py-2 rounded-md text-sm font-medium transition ${
                      isActive ? 'bg-white/20' : 'hover:bg-white/10'
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
              {user?.role === 'ADMIN' && (
                <NavLink
                  to="/admin"
                  className={({ isActive }) =>
                    `px-3 py-2 rounded-md text-sm font-medium transition ${
                      isActive ? 'bg-white/20' : 'hover:bg-white/10'
                    }`
                  }
                >
                  Admin
                </NavLink>
              )}
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative" ref={bellRef}>
              <button
                onClick={() => setBellOpen((o) => !o)}
                className="relative p-2 rounded-full hover:bg-white/10"
                aria-label="Notifications"
              >
                🔔
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] rounded-full h-4 min-w-4 px-1 flex items-center justify-center">
                    {unreadCount}
                  </span>
                )}
              </button>
              {bellOpen && (
                <div className="absolute right-0 mt-2 w-80 bg-white text-slate-800 rounded-lg shadow-xl border border-slate-200 max-h-96 overflow-y-auto">
                  <div className="px-4 py-2 border-b font-semibold text-sm">Notifications</div>
                  {notifications.length === 0 && (
                    <div className="px-4 py-6 text-sm text-slate-400 text-center">No notifications yet</div>
                  )}
                  {notifications.map((n) => (
                    <button
                      key={n.id}
                      onClick={() => {
                        if (!n.read) markRead(n.id)
                        if (n.memo) navigate(`/memos/${n.memo.id}`)
                        setBellOpen(false)
                      }}
                      className={`w-full text-left px-4 py-3 border-b last:border-0 text-sm hover:bg-slate-50 ${
                        !n.read ? 'bg-brand-50' : ''
                      }`}
                    >
                      <p className="text-slate-700">{n.message}</p>
                      <p className="text-xs text-slate-400 mt-1">{new Date(n.createdAt).toLocaleString()}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="relative">
              <button
                onClick={() => setMenuOpen((o) => !o)}
                className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-white/10"
              >
                <span className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-sm font-semibold">
                  {user?.name?.[0]?.toUpperCase() || '?'}
                </span>
                <span className="hidden sm:block text-sm">{user?.name}</span>
              </button>
              {menuOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-white text-slate-800 rounded-lg shadow-xl border border-slate-200">
                  <button
                    onClick={() => {
                      navigate('/profile')
                      setMenuOpen(false)
                    }}
                    className="w-full text-left px-4 py-2 text-sm hover:bg-slate-50"
                  >
                    Profile
                  </button>
                  <button onClick={handleLogout} className="w-full text-left px-4 py-2 text-sm hover:bg-slate-50 text-red-600">
                    Log out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        <nav className="md:hidden flex overflow-x-auto gap-1 px-4 pb-2">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap ${isActive ? 'bg-white/20' : 'hover:bg-white/10'}`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <Outlet />
      </main>
    </div>
  )
}
