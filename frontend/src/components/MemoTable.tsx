import { Link } from 'react-router-dom'
import { Card, EmptyState } from '@/components/ui'
import { StatusBadge, PriorityBadge } from '@/components/Badges'
import type { Memo } from '@/lib/types'

function currentParticipant(memo: Memo): string {
  const step = memo.workflowSteps.find((s) => s.position === memo.currentStepIndex)
  if (!step || step.status !== 'PENDING') return '—'
  return step.delegatedTo?.name || step.approver.name
}

function ageLabel(dateStr?: string | null) {
  if (!dateStr) return '—'
  const ms = Date.now() - new Date(dateStr).getTime()
  const days = Math.floor(ms / 86400000)
  if (days > 0) return `${days}d`
  const hours = Math.floor(ms / 3600000)
  if (hours > 0) return `${hours}h`
  return '<1h'
}

export function MemoTable({
  memos,
  emptyMessage = 'No memos found',
  showInboxColumns = false,
}: {
  memos: Memo[]
  emptyMessage?: string
  /** Adds department, submitted date, and time-pending columns per spec §6.1 (Inbox). */
  showInboxColumns?: boolean
}) {
  if (memos.length === 0) return <EmptyState message={emptyMessage} />

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-slate-500 text-left border-b border-slate-200">
              <th className="px-4 py-3 font-medium">Memo #</th>
              <th className="px-4 py-3 font-medium">Subject</th>
              <th className="px-4 py-3 font-medium">Sender</th>
              {showInboxColumns && <th className="px-4 py-3 font-medium">Department</th>}
              <th className="px-4 py-3 font-medium">Priority</th>
              <th className="px-4 py-3 font-medium">Status</th>
              {showInboxColumns ? (
                <>
                  <th className="px-4 py-3 font-medium">Submitted</th>
                  <th className="px-4 py-3 font-medium">Pending</th>
                </>
              ) : (
                <>
                  <th className="px-4 py-3 font-medium">Current participant</th>
                  <th className="px-4 py-3 font-medium">Updated</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {memos.map((memo) => (
              <tr key={memo.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                <td className="px-4 py-3">
                  <Link to={`/memos/${memo.id}`} className="text-brand-600 font-medium hover:underline">
                    {memo.memoNumber}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-700">{memo.subject}</td>
                <td className="px-4 py-3 text-slate-500">{memo.author.name}</td>
                {showInboxColumns && <td className="px-4 py-3 text-slate-500">{memo.department?.name || '—'}</td>}
                <td className="px-4 py-3">
                  <PriorityBadge priority={memo.priority} />
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={memo.status} />
                </td>
                {showInboxColumns ? (
                  <>
                    <td className="px-4 py-3 text-slate-400">
                      {memo.submittedAt ? new Date(memo.submittedAt).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-400">{ageLabel(memo.submittedAt)}</td>
                  </>
                ) : (
                  <>
                    <td className="px-4 py-3 text-slate-500">{currentParticipant(memo)}</td>
                    <td className="px-4 py-3 text-slate-400">{new Date(memo.updatedAt).toLocaleDateString()}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
