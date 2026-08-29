import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { api, apiErrorMessage } from '@/services/api'
import { useAuthStore } from '@/store/authStore'
import { Card, Spinner, ErrorText, Button, EmptyState, Textarea } from '@/components/ui'
import type { JoinRequest } from '@/lib/types'

export default function JoinRequests() {
  const user = useAuthStore((s) => s.user)
  const [requests, setRequests] = useState<JoinRequest[] | null>(null)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [reason, setReason] = useState('')

  async function load() {
    try {
      const res = await api.get('/join-requests')
      setRequests(res.data.data.requests)
    } catch (err) {
      setError(apiErrorMessage(err))
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function approve(id: string) {
    setBusyId(id)
    try {
      await api.post(`/join-requests/${id}/approve`)
      await load()
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setBusyId(null)
    }
  }

  async function reject(id: string) {
    setBusyId(id)
    try {
      await api.post(`/join-requests/${id}/reject`, { rejectionReason: reason || undefined })
      setRejectingId(null)
      setReason('')
      await load()
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setBusyId(null)
    }
  }

  if (user && user.role !== 'ADMIN' && user.role !== 'MANAGER') return <Navigate to="/unauthorized" replace />
  if (requests === null) return <Spinner />

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Join Requests</h1>
        <p className="text-sm text-slate-500 mt-1">People asking to join your organization as an Employee.</p>
      </div>
      <ErrorText>{error}</ErrorText>
      {requests.length === 0 ? (
        <EmptyState message="No pending join requests" />
      ) : (
        <div className="space-y-3">
          {requests.map((r) => (
            <Card key={r.id} className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium text-slate-700">{r.user.name}</p>
                  <p className="text-sm text-slate-500">{r.user.email}</p>
                  <p className="text-xs text-slate-400 mt-1">{new Date(r.createdAt).toLocaleString()}</p>
                </div>
                <div className="flex flex-col gap-2 items-end">
                  <div className="flex gap-2">
                    <Button onClick={() => approve(r.id)} disabled={busyId === r.id}>
                      Approve
                    </Button>
                    <Button variant="danger" onClick={() => setRejectingId(r.id)} disabled={busyId === r.id}>
                      Reject
                    </Button>
                  </div>
                  {rejectingId === r.id && (
                    <div className="w-64 space-y-2">
                      <Textarea
                        rows={2}
                        placeholder="Reason (optional)…"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                      />
                      <div className="flex gap-2 justify-end">
                        <Button variant="ghost" onClick={() => setRejectingId(null)}>
                          Cancel
                        </Button>
                        <Button variant="danger" onClick={() => reject(r.id)} disabled={busyId === r.id}>
                          Confirm reject
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
