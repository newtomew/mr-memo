import { useEffect, useState } from 'react'
import { api } from '@/services/api'
import { StatTile, Card, Spinner, Select, Input, Label } from '@/components/ui'
import { StatusBadge } from '@/components/Badges'
import type { Department, MemoCategory } from '@/lib/types'

interface AdminStats {
  totalUsers: number
  activeUsers: number
  totalDepartments: number
  totalMemos: number
  urgentPending: number
  avgCompletionHours: number | null
  memosByStatus: { status: string; _count: number }[]
  memosByDepartment: { departmentId: string | null; name: string; count: number }[]
  memosByCategory: { categoryId: string | null; name: string; count: number }[]
  recentMemos: { id: string; subject: string; memoNumber: string; status: any; author: { name: string } }[]
}

function formatDuration(hours: number) {
  if (hours < 24) return `${hours}h`
  return `${(hours / 24).toFixed(1)}d`
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [departments, setDepartments] = useState<Department[]>([])
  const [categories, setCategories] = useState<MemoCategory[]>([])
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [categoryId, setCategoryId] = useState('')

  useEffect(() => {
    api.get('/admin/departments').then((res) => setDepartments(res.data.data.departments))
    api.get('/admin/categories').then((res) => setCategories(res.data.data.categories))
  }, [])

  useEffect(() => {
    const params: Record<string, string> = {}
    if (dateFrom) params.dateFrom = dateFrom
    if (dateTo) params.dateTo = dateTo
    if (departmentId) params.departmentId = departmentId
    if (categoryId) params.categoryId = categoryId
    api.get('/admin/dashboard', { params }).then((res) => setStats(res.data.data))
  }, [dateFrom, dateTo, departmentId, categoryId])

  return (
    <div className="space-y-6">
      <Card className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <Label>From</Label>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </div>
        <div>
          <Label>To</Label>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
        <div>
          <Label>Department</Label>
          <Select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
            <option value="">All departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Category</Label>
          <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
      </Card>

      {!stats ? (
        <Spinner />
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <StatTile label="Total Users" value={stats.totalUsers} accent="brand" />
            <StatTile label="Active Users" value={stats.activeUsers} accent="teal" />
            <StatTile label="Departments" value={stats.totalDepartments} accent="brand" />
            <StatTile label="Urgent Pending" value={stats.urgentPending} accent="red" />
            <StatTile
              label="Avg. Completion Time"
              value={stats.avgCompletionHours === null ? '—' : formatDuration(stats.avgCompletionHours)}
              accent="amber"
            />
          </div>

          <Card className="p-5">
            <h2 className="font-semibold text-slate-700 mb-4">Memos by Status</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {stats.memosByStatus.map((s) => (
                <div key={s.status} className="flex items-center justify-between bg-slate-50 rounded-md px-3 py-2">
                  <StatusBadge status={s.status as any} />
                  <span className="font-semibold text-slate-700">{s._count}</span>
                </div>
              ))}
            </div>
          </Card>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card className="p-5">
              <h2 className="font-semibold text-slate-700 mb-4">Memos by Department</h2>
              {stats.memosByDepartment.length === 0 ? (
                <p className="text-sm text-slate-400">No department data yet</p>
              ) : (
                <div className="space-y-2">
                  {stats.memosByDepartment.map((d) => (
                    <div key={d.departmentId} className="flex items-center justify-between text-sm bg-slate-50 rounded-md px-3 py-2">
                      <span className="text-slate-600">{d.name}</span>
                      <span className="font-semibold text-slate-700">{d.count}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
            <Card className="p-5">
              <h2 className="font-semibold text-slate-700 mb-4">Memos by Category</h2>
              {stats.memosByCategory.length === 0 ? (
                <p className="text-sm text-slate-400">No category data yet</p>
              ) : (
                <div className="space-y-2">
                  {stats.memosByCategory.map((c) => (
                    <div key={c.categoryId} className="flex items-center justify-between text-sm bg-slate-50 rounded-md px-3 py-2">
                      <span className="text-slate-600">{c.name}</span>
                      <span className="font-semibold text-slate-700">{c.count}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          <Card className="p-5">
            <h2 className="font-semibold text-slate-700 mb-4">Recent Memos</h2>
            <div className="divide-y divide-slate-100">
              {stats.recentMemos.length === 0 && <p className="text-sm text-slate-400">No memos match these filters</p>}
              {stats.recentMemos.map((m) => (
                <div key={m.id} className="flex items-center justify-between py-2">
                  <div>
                    <p className="text-sm font-medium text-slate-700">{m.subject}</p>
                    <p className="text-xs text-slate-400">
                      {m.memoNumber} · {m.author.name}
                    </p>
                  </div>
                  <StatusBadge status={m.status} />
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  )
}
