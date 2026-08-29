import { useEffect, useState } from 'react'
import { api } from '@/services/api'
import { Card, Spinner, EmptyState } from '@/components/ui'

interface AuditEntry {
  id: string
  eventType: string
  entityType: string
  entityId: string | null
  description: string
  createdAt: string
  user: { id: string; name: string; email: string } | null
}

export default function AdminAuditLog() {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null)
  const [total, setTotal] = useState(0)

  useEffect(() => {
    api.get('/admin/audit-log', { params: { limit: 100 } }).then((res) => {
      setEntries(res.data.data.entries)
      setTotal(res.data.data.total)
    })
  }, [])

  if (entries === null) return <Spinner />

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">{total} recorded event(s), most recent first.</p>
      {entries.length === 0 ? (
        <EmptyState message="No audit events yet" />
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-left border-b border-slate-200">
                <th className="px-4 py-3 font-medium">When</th>
                <th className="px-4 py-3 font-medium">Event</th>
                <th className="px-4 py-3 font-medium">Actor</th>
                <th className="px-4 py-3 font-medium">Description</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3 text-slate-400 whitespace-nowrap">{new Date(e.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <span className="badge bg-slate-100 text-slate-600 font-mono text-[11px]">{e.eventType}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{e.user?.name || '—'}</td>
                  <td className="px-4 py-3 text-slate-700">{e.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}
