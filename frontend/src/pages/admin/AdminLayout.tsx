import { NavLink, Outlet } from 'react-router-dom'

const tabs = [
  { to: '/admin', label: 'Overview', end: true },
  { to: '/admin/users', label: 'Users' },
  { to: '/admin/departments', label: 'Departments' },
  { to: '/admin/categories', label: 'Categories' },
  { to: '/admin/templates', label: 'Workflow Templates' },
  { to: '/admin/audit-log', label: 'Audit Log' },
]

export default function AdminLayout() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Admin</h1>
        <p className="text-slate-500 text-sm">Manage your organization.</p>
      </div>
      <div className="flex gap-1 border-b border-slate-200">
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) =>
              `px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${
                isActive ? 'border-brand-500 text-brand-600' : 'border-transparent text-slate-500 hover:text-slate-700'
              }`
            }
          >
            {t.label}
          </NavLink>
        ))}
      </div>
      <Outlet />
    </div>
  )
}
