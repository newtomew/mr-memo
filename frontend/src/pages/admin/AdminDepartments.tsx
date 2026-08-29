import { useEffect, useState } from 'react'
import { api, apiErrorMessage } from '@/services/api'
import { Card, Button, Input, Label, ErrorText } from '@/components/ui'
import type { Department } from '@/lib/types'

export default function AdminDepartments() {
  const [departments, setDepartments] = useState<Department[]>([])
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  function load() {
    api.get('/admin/departments').then((res) => setDepartments(res.data.data.departments))
  }
  useEffect(load, [])

  async function create(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      await api.post('/admin/departments', { name, description })
      setName('')
      setDescription('')
      load()
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  async function toggleStatus(d: Department) {
    await api.put(`/admin/departments/${d.id}`, { status: d.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' })
    load()
  }

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <form onSubmit={create} className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[160px]">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="flex-1 min-w-[200px]">
            <Label>Description</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <Button type="submit" disabled={saving}>
            {saving ? 'Adding…' : '+ Add department'}
          </Button>
        </form>
        <ErrorText>{error}</ErrorText>
      </Card>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-slate-500 text-left border-b border-slate-200">
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Description</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {departments.map((d) => (
              <tr key={d.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3 text-slate-700 font-medium">{d.name}</td>
                <td className="px-4 py-3 text-slate-500">{d.description || '—'}</td>
                <td className="px-4 py-3">
                  <span className={`badge ${d.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>
                    {d.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => toggleStatus(d)} className="text-xs text-brand-600 hover:underline">
                    {d.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  )
}
