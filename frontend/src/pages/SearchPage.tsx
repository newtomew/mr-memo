import { useEffect, useState } from 'react'
import { api } from '@/services/api'
import { Input, Select, Card, Spinner } from '@/components/ui'
import { MemoTable } from '@/components/MemoTable'
import type { Memo, Department, MemoCategory } from '@/lib/types'

export default function SearchPage() {
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [priority, setPriority] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [departments, setDepartments] = useState<Department[]>([])
  const [categories, setCategories] = useState<MemoCategory[]>([])
  const [memos, setMemos] = useState<Memo[] | null>(null)
  const [total, setTotal] = useState(0)

  useEffect(() => {
    api.get('/admin/departments').then((res) => setDepartments(res.data.data.departments))
    api.get('/admin/categories').then((res) => setCategories(res.data.data.categories))
  }, [])

  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  useEffect(() => {
    const params: Record<string, string> = {}
    if (q) params.q = q
    if (status) params.status = status
    if (priority) params.priority = priority
    if (departmentId) params.departmentId = departmentId
    if (categoryId) params.categoryId = categoryId
    if (dateFrom) params.dateFrom = dateFrom
    if (dateTo) params.dateTo = dateTo

    const handle = setTimeout(() => {
      api.get('/search', { params }).then((res) => {
        setMemos(res.data.data.memos)
        setTotal(res.data.data.total)
      })
    }, 300)
    return () => clearTimeout(handle)
  }, [q, status, priority, departmentId, categoryId, dateFrom, dateTo])

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Search</h1>
        <p className="text-slate-500 text-sm">Find memos by number, subject, body, or author.</p>
      </div>

      <Card className="p-4 grid grid-cols-1 sm:grid-cols-4 gap-3">
        <Input placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} className="sm:col-span-2" />
        <Select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="PENDING_REVIEW">Pending Review</option>
          <option value="PENDING_APPROVAL">Pending Approval</option>
          <option value="CHANGES_REQUESTED">Changes Requested</option>
          <option value="REJECTED">Rejected</option>
          <option value="APPROVED">Approved</option>
        </Select>
        <Select value={priority} onChange={(e) => setPriority(e.target.value)}>
          <option value="">All priorities</option>
          <option value="NORMAL">Normal</option>
          <option value="HIGH">High</option>
          <option value="URGENT">Urgent</option>
        </Select>
        <Select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
          <option value="">All departments</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>
        <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <div>
          <label className="block text-xs text-slate-500 mb-1">From</label>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">To</label>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
      </Card>

      {memos === null ? (
        <Spinner />
      ) : (
        <>
          <p className="text-sm text-slate-500">{total} result(s)</p>
          <MemoTable memos={memos} emptyMessage="No memos match your search" />
        </>
      )}
    </div>
  )
}
