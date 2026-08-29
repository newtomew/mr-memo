import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { platformApi } from '@/services/platformApi'
import { apiErrorMessage } from '@/services/api'
import { Card, Spinner, ErrorText, Button, EmptyState } from '@/components/ui'

interface UserRow {
  id: string
  name: string
  email: string
  status: 'ACTIVE' | 'INACTIVE' | 'PENDING_APPROVAL'
  createdAt: string
}
interface MemoRow {
  id: string
  memoNumber: string
  subject: string
  status: string
  createdAt: string
  author: { id: string; name: string }
}
interface AuditRow {
  id: string
  eventType: string
  description: string
  createdAt: string
}

type Tab = 'managers' | 'employees' | 'memos' | 'activity'

export default function PlatformOrgDetail() {
  const { id } = useParams<{ id: string }>()
  const [data, setData] = useState<{
    organization: { id: string; name: string; slug: string; status: string }
    admins: UserRow[]
    managers: UserRow[]
    employees: UserRow[]
    memos: MemoRow[]
    auditLog: AuditRow[]
  } | null>(null)
  const [tab, setTab] = useState<Tab>('managers')
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  async function load() {
    try {
      const res = await platformApi.get(`/platform/organizations/${id}`)
      setData(res.data.data)
    } catch (err) {
      setError(apiErrorMessage(err))
    }
  }

  useEffect(() => {
    load()
  }, [id])

  async function toggleUserBan(u: UserRow) {
    setBusyId(u.id)
    try {
      await platformApi.put(`/platform/users/${u.id}/ban`, { banned: u.status !== 'INACTIVE' })
      await load()
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setBusyId(null)
    }
  }

  async function toggleMemoBlock(m: MemoRow) {
    setBusyId(m.id)
    try {
      await platformApi.put(`/platform/memos/${m.id}/block`, { blocked: m.status !== 'BLOCKED' })
      await load()
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setBusyId(null)
    }
  }

  if (!data) return <Spinner />

  const userList = tab === 'managers' ? data.managers : tab === 'employees' ? data.employees : []

  return (
    <div className="space-y-4">
      <Link to="/platform" className="text-sm text-slate-500 hover:underline">
        ← All organizations
      </Link>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">{data.organization.name}</h1>
          <p className="text-sm text-slate-500">{data.organization.slug}</p>
        </div>
        <span
          className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            data.organization.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
          }`}
        >
          {data.organization.status === 'ACTIVE' ? 'Active' : 'Banned'}
        </span>
      </div>

      {data.admins.length > 0 && (
        <p className="text-sm text-slate-500">
          Administrator{data.admins.length > 1 ? 's' : ''}: {data.admins.map((a) => a.name).join(', ')}
        </p>
      )}

      <ErrorText>{error}</ErrorText>

      <div className="flex gap-1 border-b border-slate-200">
        {(['managers', 'employees', 'memos', 'activity'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize border-b-2 -mb-px ${
              tab === t ? 'border-brand-500 text-brand-600' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t} {t === 'managers' && `(${data.managers.length})`}
            {t === 'employees' && `(${data.employees.length})`}
            {t === 'memos' && `(${data.memos.length})`}
          </button>
        ))}
      </div>

      {(tab === 'managers' || tab === 'employees') && (
        <Card className="overflow-x-auto">
          {userList.length === 0 ? (
            <EmptyState message={`No ${tab} in this organization`} />
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-left">
                <tr>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Joined</th>
                  <th className="px-4 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {userList.map((u) => (
                  <tr key={u.id} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-medium text-slate-700">{u.name}</td>
                    <td className="px-4 py-3 text-slate-500">{u.email}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          u.status === 'ACTIVE'
                            ? 'bg-emerald-100 text-emerald-700'
                            : u.status === 'PENDING_APPROVAL'
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {u.status === 'ACTIVE' ? 'Active' : u.status === 'PENDING_APPROVAL' ? 'Pending' : 'Banned'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{new Date(u.createdAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <Button
                        variant={u.status === 'INACTIVE' ? 'secondary' : 'danger'}
                        onClick={() => toggleUserBan(u)}
                        disabled={busyId === u.id}
                      >
                        {u.status === 'INACTIVE' ? 'Unban' : 'Ban'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {tab === 'memos' && (
        <Card className="overflow-x-auto">
          {data.memos.length === 0 ? (
            <EmptyState message="No memos yet" />
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-left">
                <tr>
                  <th className="px-4 py-3 font-medium">Memo</th>
                  <th className="px-4 py-3 font-medium">Author</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                  <th className="px-4 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {data.memos.map((m) => (
                  <tr key={m.id} className="border-t border-slate-100">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-700">{m.subject}</p>
                      <p className="text-xs text-slate-400">{m.memoNumber}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{m.author.name}</td>
                    <td className="px-4 py-3 text-slate-500">{m.status}</td>
                    <td className="px-4 py-3 text-slate-500">{new Date(m.createdAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <Button
                        variant={m.status === 'BLOCKED' ? 'secondary' : 'danger'}
                        onClick={() => toggleMemoBlock(m)}
                        disabled={busyId === m.id}
                      >
                        {m.status === 'BLOCKED' ? 'Unblock' : 'Block'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {tab === 'activity' && (
        <Card className="divide-y divide-slate-100">
          {data.auditLog.length === 0 ? (
            <EmptyState message="No activity recorded yet" />
          ) : (
            data.auditLog.map((a) => (
              <div key={a.id} className="px-4 py-3 text-sm">
                <p className="text-slate-700">{a.description}</p>
                <p className="text-xs text-slate-400 mt-0.5">{new Date(a.createdAt).toLocaleString()}</p>
              </div>
            ))
          )}
        </Card>
      )}
    </div>
  )
}
