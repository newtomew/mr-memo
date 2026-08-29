import { useEffect, useState } from 'react'
import { api, apiErrorMessage } from '@/services/api'
import { Card, Button, Input, Label, Select, ErrorText } from '@/components/ui'

interface OrgUser {
  id: string
  name: string
  email: string
}
interface Delegation {
  id: string
  startDate: string
  endDate: string
  reason?: string | null
  active: boolean
  delegate?: { id: string; name: string; email: string }
  delegatingUser?: { id: string; name: string; email: string }
}

export function DelegationsSection({ currentUserId }: { currentUserId: string }) {
  const [given, setGiven] = useState<Delegation[]>([])
  const [received, setReceived] = useState<Delegation[]>([])
  const [users, setUsers] = useState<OrgUser[]>([])
  const [showForm, setShowForm] = useState(false)
  const [delegateId, setDelegateId] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  function load() {
    api.get('/delegations').then((res) => {
      setGiven(res.data.data.given)
      setReceived(res.data.data.received)
    })
  }

  useEffect(() => {
    load()
    api.get('/users').then((res) => setUsers(res.data.data.users.filter((u: OrgUser) => u.id !== currentUserId)))
  }, [currentUserId])

  async function create(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      await api.post('/delegations', { delegateId, startDate, endDate, reason: reason || undefined })
      setDelegateId('')
      setStartDate('')
      setEndDate('')
      setReason('')
      setShowForm(false)
      load()
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  async function revoke(id: string) {
    if (!confirm('Revoke this delegation?')) return
    await api.delete(`/delegations/${id}`)
    load()
  }

  const isActiveNow = (d: Delegation) => d.active && new Date(d.startDate) <= new Date() && new Date() <= new Date(d.endDate)

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-slate-700">Delegation</h2>
          <p className="text-xs text-slate-400">
            Let someone else act on your behalf in approval workflows for a date range — separate from forwarding a single memo.
          </p>
        </div>
        <Button variant="secondary" onClick={() => setShowForm((s) => !s)}>
          {showForm ? 'Cancel' : '+ Delegate'}
        </Button>
      </div>

      {showForm && (
        <form onSubmit={create} className="space-y-3 border-t border-slate-100 pt-3">
          <div>
            <Label>Delegate to</Label>
            <Select value={delegateId} onChange={(e) => setDelegateId(e.target.value)} required>
              <option value="">Select a person…</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.email})
                </option>
              ))}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Start date</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
            </div>
            <div>
              <Label>End date</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
            </div>
          </div>
          <div>
            <Label>Reason (optional)</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. On leave" />
          </div>
          <ErrorText>{error}</ErrorText>
          <Button type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Create delegation'}
          </Button>
        </form>
      )}

      <div>
        <h3 className="text-sm font-medium text-slate-600 mb-2">Delegated by you</h3>
        {given.length === 0 ? (
          <p className="text-sm text-slate-400">None</p>
        ) : (
          <div className="space-y-2">
            {given.map((d) => (
              <div key={d.id} className="flex items-center justify-between text-sm bg-slate-50 rounded-md px-3 py-2">
                <span>
                  {d.delegate?.name} · {new Date(d.startDate).toLocaleDateString()}–{new Date(d.endDate).toLocaleDateString()}
                  {isActiveNow(d) && <span className="ml-2 badge bg-emerald-100 text-emerald-700">Active now</span>}
                  {!d.active && <span className="ml-2 badge bg-slate-200 text-slate-500">Revoked</span>}
                </span>
                {d.active && (
                  <button onClick={() => revoke(d.id)} className="text-xs text-red-500 hover:underline">
                    Revoke
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {received.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-slate-600 mb-2">Delegated to you</h3>
          <div className="space-y-2">
            {received.map((d) => (
              <div key={d.id} className="flex items-center justify-between text-sm bg-slate-50 rounded-md px-3 py-2">
                <span>
                  {d.delegatingUser?.name} · {new Date(d.startDate).toLocaleDateString()}–{new Date(d.endDate).toLocaleDateString()}
                  {isActiveNow(d) && <span className="ml-2 badge bg-emerald-100 text-emerald-700">Active now</span>}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  )
}
