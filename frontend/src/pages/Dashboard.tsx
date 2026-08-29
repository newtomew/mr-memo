import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '@/services/api'
import { useAuthStore } from '@/store/authStore'
import { Card, StatTile, Spinner, Button } from '@/components/ui'
import { StatusBadge } from '@/components/Badges'
import type { Memo } from '@/lib/types'

interface DashboardData {
  awaitingAction: number
  submitted: number
  completed: number
  urgent: number
  byStatus: { status: string; _count: number }[]
  recent: Memo[]
}

export default function Dashboard() {
  const user = useAuthStore((s) => s.user)
  const [data, setData] = useState<DashboardData | null>(null)

  useEffect(() => {
    api.get('/dashboard').then((res) => setData(res.data.data))
  }, [])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Hi {user?.name?.split(' ')[0]},</h1>
          <p className="text-slate-500">Here's what's happening with your memos.</p>
        </div>
        <Link to="/memos/new">
          <Button>+ Create Memo</Button>
        </Link>
      </div>

      {!data ? (
        <Spinner />
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Link to="/memos/inbox">
              <StatTile label="Awaiting Your Action" value={data.awaitingAction} accent="amber" />
            </Link>
            <Link to="/memos/mine">
              <StatTile label="Submitted" value={data.submitted} accent="brand" />
            </Link>
            <StatTile label="Completed" value={data.completed} accent="teal" />
            <StatTile label="Urgent" value={data.urgent} accent="red" />
          </div>

          {data.byStatus.length > 0 && (
            <Card className="p-5">
              <h2 className="font-semibold text-slate-700 mb-4">Your Memos by Status</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {data.byStatus.map((s) => (
                  <div key={s.status} className="flex items-center justify-between bg-slate-50 rounded-md px-3 py-2">
                    <StatusBadge status={s.status as any} />
                    <span className="font-semibold text-slate-700">{s._count}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Card className="p-5">
            <h2 className="font-semibold text-slate-700 mb-4">Recent Activity</h2>
            {data.recent.length === 0 ? (
              <p className="text-sm text-slate-400">No memos yet. Create your first one!</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {data.recent.map((memo) => (
                  <Link
                    key={memo.id}
                    to={`/memos/${memo.id}`}
                    className="flex items-center justify-between py-3 hover:bg-slate-50 -mx-2 px-2 rounded-md"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-700">{memo.subject}</p>
                      <p className="text-xs text-slate-400">
                        {memo.memoNumber} · {memo.author.name}
                      </p>
                    </div>
                    <StatusBadge status={memo.status} />
                  </Link>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  )
}
