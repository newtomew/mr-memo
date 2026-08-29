import type { WorkflowStep } from '@/lib/types'

const STEP_ICON: Record<string, string> = {
  APPROVED: '✓',
  REJECTED: '✕',
  CHANGES_REQUESTED: '↺',
  PENDING: '…',
  SKIPPED: '–',
}

const STEP_COLOR: Record<string, string> = {
  APPROVED: 'bg-emerald-500',
  REJECTED: 'bg-red-500',
  CHANGES_REQUESTED: 'bg-orange-500',
  PENDING: 'bg-slate-300',
  SKIPPED: 'bg-slate-300',
}

export function WorkflowTimeline({ steps, currentStepIndex }: { steps: WorkflowStep[]; currentStepIndex: number }) {
  return (
    <ol className="space-y-4">
      {steps.map((step) => {
        const isCurrent = step.position === currentStepIndex && step.status === 'PENDING'
        return (
          <li key={step.id} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span
                className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold ${STEP_COLOR[step.status]} ${
                  isCurrent ? 'ring-4 ring-brand-100' : ''
                }`}
              >
                {STEP_ICON[step.status]}
              </span>
              {step.position < steps.length - 1 && <span className="w-px flex-1 bg-slate-200 mt-1" />}
            </div>
            <div className="pb-4 flex-1">
              <p className="text-sm font-medium text-slate-700">
                {step.title ? `${step.title} — ` : ''}
                {step.approver.name}
                {step.delegatedTo && <span className="text-xs text-orange-600"> (delegated to {step.delegatedTo.name})</span>}
              </p>
              <p className="text-xs text-slate-400">
                {step.status === 'PENDING' ? (isCurrent ? 'Awaiting review' : 'Not yet reached') : step.status.replace('_', ' ')}
                {step.actedAt && ` · ${new Date(step.actedAt).toLocaleString()}`}
              </p>
              {step.approvals.map((a) => (
                <p key={a.id} className="text-xs text-slate-500 mt-1 bg-slate-50 rounded px-2 py-1">
                  "{a.reason}" — {a.decidedBy.name}
                </p>
              ))}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
