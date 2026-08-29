import { useEffect, useState } from 'react'
import { api, apiErrorMessage } from '@/services/api'
import { Card, Button, Input, Select, Label, ErrorText } from '@/components/ui'
import type { Department, User } from '@/lib/types'

export default function AdminUsers() {
  const [users, setUsers] = useState<User[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', password: '', departmentId: '', role: 'USER', designation: '' })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  function load() {
    api.get('/admin/users').then((res) => setUsers(res.data.data.users))
    api.get('/admin/departments').then((res) => setDepartments(res.data.data.departments))
  }

  useEffect(load, [])

  async function createUser(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      await api.post('/admin/users', { ...form, departmentId: form.departmentId || undefined })
      setForm({ name: '', email: '', password: '', departmentId: '', role: 'USER', designation: '' })
      setShowForm(false)
      load()
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  async function changeRole(user: User, role: string) {
    if (role === user.role) return
    await api.put(`/admin/users/${user.id}`, { role })
    load()
  }

  async function deactivate(user: User) {
    if (!confirm(`Deactivate ${user.name}?`)) return
    await api.delete(`/admin/users/${user.id}`)
    load()
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setShowForm((s) => !s)}>{showForm ? 'Cancel' : '+ Add user'}</Button>
      </div>

      {showForm && (
        <Card className="p-5">
          <form onSubmit={createUser} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div>
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            </div>
            <div>
              <Label>Temporary password</Label>
              <Input type="password" minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
            </div>
            <div>
              <Label>Designation</Label>
              <Input value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} />
            </div>
            <div>
              <Label>Department</Label>
              <Select value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })}>
                <option value="">— None —</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Role</Label>
              <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                <option value="USER">Employee</option>
                <option value="MANAGER">Manager</option>
                <option value="ADMIN">Administrator</option>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <ErrorText>{error}</ErrorText>
              <Button type="submit" disabled={saving} className="mt-2">
                {saving ? 'Creating…' : 'Create user'}
              </Button>
            </div>
          </form>
        </Card>
      )}

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-slate-500 text-left border-b border-slate-200">
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Department</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3 text-slate-700">{u.name}</td>
                <td className="px-4 py-3 text-slate-500">{u.email}</td>
                <td className="px-4 py-3 text-slate-500">{u.department?.name || '—'}</td>
                <td className="px-4 py-3">
                  <span
                    className={`badge ${
                      u.role === 'ADMIN'
                        ? 'bg-brand-100 text-brand-700'
                        : u.role === 'MANAGER'
                          ? 'bg-teal-100 text-teal-700'
                          : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {u.role}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`badge ${
                      u.status === 'ACTIVE'
                        ? 'bg-emerald-100 text-emerald-700'
                        : u.status === 'PENDING_APPROVAL'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-slate-200 text-slate-500'
                    }`}
                  >
                    {u.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right space-x-2">
                  <Select
                    value={u.role}
                    onChange={(e) => changeRole(u, e.target.value)}
                    className="inline-block w-auto py-1 text-xs"
                  >
                    <option value="USER">Employee</option>
                    <option value="MANAGER">Manager</option>
                    <option value="ADMIN">Administrator</option>
                  </Select>
                  {u.status === 'ACTIVE' && (
                    <button onClick={() => deactivate(u)} className="text-xs text-red-600 hover:underline">
                      Deactivate
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  )
}
