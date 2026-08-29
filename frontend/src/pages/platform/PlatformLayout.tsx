import { NavLink, Navigate, Outlet, useNavigate } from 'react-router-dom'
import { usePlatformAuthStore } from '@/store/platformAuthStore'

export default function PlatformLayout() {
  const { admin, accessToken, logout } = usePlatformAuthStore()
  const navigate = useNavigate()

  if (!admin || !accessToken) return <Navigate to="/platform/login" replace />

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-slate-900 text-white sticky top-0 z-30 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between h-16">
          <div className="flex items-center gap-8">
            <button onClick={() => navigate('/platform')} className="font-bold text-xl tracking-tight">
              mr.memo <span className="text-slate-400 font-normal text-sm ml-1">Platform</span>
            </button>
            <nav className="hidden md:flex gap-1">
              <NavLink
                to="/platform"
                end
                className={({ isActive }) =>
                  `px-3 py-2 rounded-md text-sm font-medium transition ${isActive ? 'bg-white/20' : 'hover:bg-white/10'}`
                }
              >
                Organizations
              </NavLink>
              <NavLink
                to="/platform/approvals"
                className={({ isActive }) =>
                  `px-3 py-2 rounded-md text-sm font-medium transition ${isActive ? 'bg-white/20' : 'hover:bg-white/10'}`
                }
              >
                Manager Approvals
              </NavLink>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-300">{admin.name}</span>
            <button
              onClick={() => {
                logout()
                navigate('/platform/login')
              }}
              className="text-sm text-slate-300 hover:text-white"
            >
              Log out
            </button>
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <Outlet />
      </main>
    </div>
  )
}
