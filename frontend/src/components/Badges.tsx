import type { MemoPriority, MemoStatus } from '@/lib/types'

const STATUS_STYLES: Record<MemoStatus, string> = {
  DRAFT: 'bg-slate-100 text-slate-600',
  SUBMITTED: 'bg-sky-100 text-sky-700',
  PENDING_REVIEW: 'bg-amber-100 text-amber-700',
  PENDING_APPROVAL: 'bg-amber-100 text-amber-700',
  CHANGES_REQUESTED: 'bg-orange-100 text-orange-700',
  REJECTED: 'bg-red-100 text-red-700',
  APPROVED: 'bg-emerald-100 text-emerald-700',
  CANCELLED: 'bg-slate-200 text-slate-500',
}

const STATUS_LABELS: Record<MemoStatus, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  PENDING_REVIEW: 'Pending Review',
  PENDING_APPROVAL: 'Pending Approval',
  CHANGES_REQUESTED: 'Changes Requested',
  REJECTED: 'Rejected',
  APPROVED: 'Approved',
  CANCELLED: 'Cancelled',
}

export function StatusBadge({ status }: { status: MemoStatus }) {
  return <span className={`badge ${STATUS_STYLES[status]}`}>{STATUS_LABELS[status]}</span>
}

const PRIORITY_STYLES: Record<MemoPriority, string> = {
  NORMAL: 'bg-slate-100 text-slate-600',
  HIGH: 'bg-orange-100 text-orange-700',
  URGENT: 'bg-red-100 text-red-700',
}

export function PriorityBadge({ priority }: { priority: MemoPriority }) {
  return <span className={`badge ${PRIORITY_STYLES[priority]}`}>{priority}</span>
}
