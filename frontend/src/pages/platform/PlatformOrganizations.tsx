import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { platformApi } from '@/services/platformApi'
import { apiErrorMessage } from '@/services/api'
import { Card, Spinner, ErrorText, Button, EmptyState } from '@/components/ui'

interface OrgRow {
  id: string
  name: string
  slug: string
  status: 'ACTIVE' | 'INACTIVE'
  createdAt: string
  _count: { users: number; memos: number }
}

export default function PlatformOrganizations() {
  const navigate = useNavigate()
  const [orgs, setOrgs] = useState<OrgRow[] | null>(null)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  async function load() {
    try {
      const res = await platformApi.get('/platform/organizations')
      setOrgs(res.data.data.organizations)
    } catch (err) {
      setError(apiErrorMessage(err))
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function toggleBan(org: OrgRow) {
    setBusyId(org.id)
    try {
      await platformApi.put(`/platform/organizations/${org.id}/ban`, { banned: org.status === 'ACTIVE' })
      await load()
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setBusyId(null)
    }
  }

  if (orgs === null) return <Spinner />

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-800">Organizations</h1>
      <ErrorText>{error}</ErrorText>
      {orgs.length === 0 ? (
        <EmptyState message="No organizations have signed up yet" />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Organization</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Users</th>
                <th className="px-4 py-3 font-medium">Memos</th>
                <th className="px-4 py-3 font-medium">Signed up</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {orgs.map((org) => (
                <tr key={org.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <button
                      onClick={() => navigate(`/platform/organizations/${org.id}`)}
                      className="text-brand-600 font-medium hover:underline"
                    >
                      {org.name}
                    </button>
                    <p className="text-xs text-slate-400">{org.slug}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        org.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {org.status === 'ACTIVE' ? 'Active' : 'Banned'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{org._count.users}</td>
                  <td className="px-4 py-3 text-slate-600">{org._count.memos}</td>
                  <td className="px-4 py-3 text-slate-500">{new Date(org.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <Button
                      variant={org.status === 'ACTIVE' ? 'danger' : 'secondary'}
                      onClick={() => toggleBan(org)}
                      disabled={busyId === org.id}
                    >
                      {org.status === 'ACTIVE' ? 'Ban' : 'Unban'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}
