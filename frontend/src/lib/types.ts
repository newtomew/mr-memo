export type UserRole = 'ADMIN' | 'USER'
export type UserStatus = 'ACTIVE' | 'INACTIVE'
export type MemoPriority = 'NORMAL' | 'HIGH' | 'URGENT'
export type MemoStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'PENDING_REVIEW'
  | 'PENDING_APPROVAL'
  | 'CHANGES_REQUESTED'
  | 'REJECTED'
  | 'APPROVED'
  | 'CANCELLED'
export type WorkflowStepStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED' | 'SKIPPED'
export type ApprovalDecision = 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED' | 'FORWARDED' | 'COMMENTED'
export type CommentType = 'GENERAL' | 'APPROVAL' | 'REJECTION' | 'CHANGE_REQUEST'
export type NotificationType =
  | 'ACTION_REQUIRED'
  | 'APPROVED'
  | 'REJECTED'
  | 'CHANGES_REQUESTED'
  | 'COMMENT'
  | 'RESUBMITTED'
  | 'COMPLETED'
  | 'ASSIGNED'

export interface Organization {
  id: string
  name: string
  slug: string
  logoUrl?: string | null
  contactEmail?: string | null
}

export interface Department {
  id: string
  name: string
  description?: string | null
  status: 'ACTIVE' | 'INACTIVE'
}

export interface MemoCategory {
  id: string
  name: string
  description?: string | null
  status: 'ACTIVE' | 'INACTIVE'
}

export interface User {
  id: string
  authId: string
  organizationId: string
  email: string
  name: string
  designation?: string | null
  role: UserRole
  status: UserStatus
  department?: Department | null
  organization?: Organization
}

export interface WorkflowApproval {
  id: string
  decision: ApprovalDecision
  reason?: string | null
  decidedAt: string
  decidedBy: { id: string; name: string }
}

export interface WorkflowStep {
  id: string
  position: number
  title?: string | null
  status: WorkflowStepStatus
  actedAt?: string | null
  approver: { id: string; name: string; email: string }
  delegatedTo?: { id: string; name: string; email: string } | null
  approvals: WorkflowApproval[]
}

export interface Comment {
  id: string
  type: CommentType
  content: string
  createdAt: string
  author: { id: string; name: string; email: string }
}

export interface Attachment {
  id: string
  fileName: string
  fileSize: number
  mimeType: string
  createdAt: string
  uploadedBy: { id: string; name: string }
}

export interface MemoVersion {
  id: string
  versionNumber: number
  subject: string
  body: string
  createdAt: string
}

export interface Memo {
  id: string
  memoNumber: string
  subject: string
  body: string
  priority: MemoPriority
  status: MemoStatus
  currentStepIndex: number
  createdAt: string
  updatedAt: string
  submittedAt?: string | null
  completedAt?: string | null
  author: { id: string; name: string; email: string }
  department?: Department | null
  category?: MemoCategory | null
  workflowSteps: WorkflowStep[]
  comments: Comment[]
  attachments: Attachment[]
  versions: MemoVersion[]
}

export interface Notification {
  id: string
  type: NotificationType
  message: string
  read: boolean
  createdAt: string
  memo?: { id: string; subject: string; memoNumber: string } | null
}
