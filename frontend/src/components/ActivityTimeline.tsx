import type { Memo } from '@/lib/types'

interface TimelineEvent {
  timestamp: string
  label: string
}

const DECISION_VERB: Record<string, string> = {
  APPROVED: 'approved',
  REJECTED: 'rejected',
  CHANGES_REQUESTED: 'requested changes on',
  FORWARDED: 'forwarded',
  COMMENTED: 'commented on',
}

/**
 * Merges memo creation, submission, every workflow decision, and every
 * comment into one chronological stream — matching the spec's example
 * format (§7): "10:32 AM — Memo created by A", "11:14 AM — B approved", etc.
 * The Workflow and Comments sections elsewhere on the page stay for their
 * structured/interactive views; this is the narrative read of the same data.
 */
function buildTimeline(memo: Memo): TimelineEvent[] {
  const events: TimelineEvent[] = []

  events.push({ timestamp: memo.createdAt, label: `Memo created by ${memo.author.name}` })

  if (memo.submittedAt) {
    events.push({ timestamp: memo.submittedAt, label: `Memo submitted by ${memo.author.name}` })
  }

  for (const step of memo.workflowSteps) {
    for (const approval of step.approvals) {
      const verb = DECISION_VERB[approval.decision] || approval.decision.toLowerCase()
      const reason = approval.reason ? ` — "${approval.reason}"` : ''
      events.push({ timestamp: approval.decidedAt, label: `${approval.decidedBy.name} ${verb} the memo${reason}` })
    }
  }

  for (const comment of memo.comments) {
    events.push({ timestamp: comment.createdAt, label: `${comment.author.name} commented: "${comment.content}"` })
  }

  if (memo.completedAt) {
    events.push({ timestamp: memo.completedAt, label: 'Memo marked Approved/Completed' })
  }

  return events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
}

export function ActivityTimeline({ memo }: { memo: Memo }) {
  const events = buildTimeline(memo)
  if (events.length === 0) return null

  return (
    <ol className="space-y-2">
      {events.map((e, i) => (
        <li key={i} className="flex gap-3 text-sm">
          <span className="text-slate-400 whitespace-nowrap tabular-nums">
            {new Date(e.timestamp).toLocaleString(undefined, {
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            })}
          </span>
          <span className="text-slate-700">{e.label}</span>
        </li>
      ))}
    </ol>
  )
}
