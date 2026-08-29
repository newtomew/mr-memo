import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api, apiErrorMessage } from '@/services/api'
import { useAuthStore } from '@/store/authStore'
import { Button, Textarea, Card, Spinner, ErrorText, Select } from '@/components/ui'
import { StatusBadge, PriorityBadge } from '@/components/Badges'
import { WorkflowTimeline } from '@/components/WorkflowTimeline'
import { ActivityTimeline } from '@/components/ActivityTimeline'
import type { Memo } from '@/lib/types'
// Dynamically imported on click (jsPDF drags in html2canvas-sized deps
// that no other page needs — no reason to ship them in the main bundle).

type ActionKind = 'approve' | 'reject' | 'request-changes' | 'forward' | null

export default function MemoDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)

  const [memo, setMemo] = useState<Memo | null>(null)
  const [error, setError] = useState('')
  const [actionKind, setActionKind] = useState<ActionKind>(null)
  const [reason, setReason] = useState('')
  const [forwardTo, setForwardTo] = useState('')
  const [orgUsers, setOrgUsers] = useState<{ id: string; name: string }[]>([])
  const [busy, setBusy] = useState(false)
  const [commentText, setCommentText] = useState('')
  const [uploading, setUploading] = useState(false)
  const [delegatingFromIds, setDelegatingFromIds] = useState<Set<string>>(new Set())

  // Guards against out-of-order responses (e.g. a slow initial fetch resolving
  // after a post-action reload) clobbering fresher state.
  const loadSeq = useRef(0)
  const load = useCallback(() => {
    if (!id) return
    const seq = ++loadSeq.current
    api.get(`/memos/${id}`).then((res) => {
      if (seq === loadSeq.current) setMemo(res.data.data.memo)
    })
  }, [id])

  useEffect(() => {
    load()
    api.get('/users').then((res) => setOrgUsers(res.data.data.users))
    api.get('/delegations').then((res) => {
      const now = new Date()
      const activeFrom = res.data.data.received
        .filter((d: any) => d.active && new Date(d.startDate) <= now && now <= new Date(d.endDate))
        .map((d: any) => d.delegatingUser.id)
      setDelegatingFromIds(new Set(activeFrom))
    })
  }, [load])

  if (!memo) return <Spinner />

  const currentStep = memo.workflowSteps.find((s) => s.position === memo.currentStepIndex)
  const isCurrentApprover =
    !!currentStep &&
    currentStep.status === 'PENDING' &&
    (currentStep.approver.id === user?.id ||
      currentStep.delegatedTo?.id === user?.id ||
      delegatingFromIds.has(currentStep.approver.id))
  const isAuthor = memo.author.id === user?.id
  const canEdit = isAuthor && ['DRAFT', 'CHANGES_REQUESTED'].includes(memo.status)
  const canCancel = isAuthor && ['SUBMITTED', 'PENDING_REVIEW', 'PENDING_APPROVAL', 'CHANGES_REQUESTED'].includes(memo.status)

  async function runAction() {
    setError('')
    setBusy(true)
    try {
      if (actionKind === 'approve') {
        await api.post(`/workflow/${id}/approve`, { reason: reason || undefined })
      } else if (actionKind === 'reject') {
        if (!reason) throw new Error('A reason is required to reject')
        await api.post(`/workflow/${id}/reject`, { reason })
      } else if (actionKind === 'request-changes') {
        if (!reason) throw new Error('A message is required')
        await api.post(`/workflow/${id}/request-changes`, { reason })
      } else if (actionKind === 'forward') {
        if (!forwardTo) throw new Error('Select who to forward to')
        await api.post(`/workflow/${id}/forward`, { forwardToUserId: forwardTo })
      }
      setActionKind(null)
      setReason('')
      setForwardTo('')
      load()
    } catch (err: any) {
      setError(err?.message || apiErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleCancel() {
    if (!confirm('Withdraw this memo? This cannot be undone.')) return
    setBusy(true)
    try {
      await api.post(`/memos/${id}/cancel`)
      load()
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function submitComment() {
    if (!commentText.trim()) return
    await api.post(`/comments/${id}`, { content: commentText })
    setCommentText('')
    load()
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const base64 = await fileToBase64(file)
      await api.post(`/attachments/${id}`, { fileName: file.name, mimeType: file.type || 'application/octet-stream', base64Data: base64 })
      load()
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  async function downloadAttachment(attachmentId: string, fileName: string) {
    const res = await api.get(`/attachments/download/${attachmentId}`)
    const a = document.createElement('a')
    a.href = res.data.data.url
    a.download = fileName
    a.target = '_blank'
    a.click()
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-mono text-slate-400">{memo.memoNumber}</p>
          <h1 className="text-2xl font-bold text-slate-800">{memo.subject}</h1>
          <p className="text-sm text-slate-500 mt-1">
            By {memo.author.name} · {new Date(memo.createdAt).toLocaleDateString()}
            {memo.department && ` · ${memo.department.name}`}
            {memo.category && ` · ${memo.category.name}`}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex gap-2">
            <StatusBadge status={memo.status} />
            <PriorityBadge priority={memo.priority} />
          </div>
          <div className="flex gap-2">
            {canEdit && (
              <Button variant="secondary" onClick={() => navigate(`/memos/${memo.id}/edit`)}>
                {memo.status === 'CHANGES_REQUESTED' ? 'Edit & Resubmit' : 'Edit'}
              </Button>
            )}
            {memo.status !== 'DRAFT' && (
              <Button
                variant="secondary"
                onClick={() => import('@/lib/pdfExport').then((m) => m.exportMemoPdf(memo))}
              >
                Export PDF
              </Button>
            )}
            {canCancel && (
              <Button variant="danger" onClick={handleCancel} disabled={busy}>
                Withdraw
              </Button>
            )}
          </div>
        </div>
      </div>

      <Card className="p-6">
        <p className="whitespace-pre-wrap text-slate-700 leading-relaxed">{memo.body}</p>
      </Card>

      <Card className="p-6">
        <h2 className="font-semibold text-slate-700 mb-4">Activity Timeline</h2>
        <ActivityTimeline memo={memo} />
      </Card>

      {isCurrentApprover && (
        <Card className="p-6 border-2 border-brand-200">
          <h2 className="font-semibold text-slate-700 mb-3">Your action is required</h2>
          {actionKind ? (
            <div className="space-y-3">
              {actionKind === 'forward' ? (
                <Select value={forwardTo} onChange={(e) => setForwardTo(e.target.value)}>
                  <option value="">Select a person…</option>
                  {orgUsers
                    .filter((u) => u.id !== user?.id)
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                </Select>
              ) : (
                <Textarea
                  rows={3}
                  placeholder={actionKind === 'approve' ? 'Optional comment…' : 'Reason (required)…'}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              )}
              <ErrorText>{error}</ErrorText>
              <div className="flex gap-2">
                <Button onClick={runAction} disabled={busy}>
                  {busy ? 'Working…' : 'Confirm'}
                </Button>
                <Button variant="ghost" onClick={() => setActionKind(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setActionKind('approve')}>Approve</Button>
              <Button variant="danger" onClick={() => setActionKind('reject')}>
                Reject
              </Button>
              <Button variant="secondary" onClick={() => setActionKind('request-changes')}>
                Request Changes
              </Button>
              <Button variant="secondary" onClick={() => setActionKind('forward')}>
                Forward
              </Button>
            </div>
          )}
        </Card>
      )}

      <Card className="p-6">
        <h2 className="font-semibold text-slate-700 mb-4">Workflow</h2>
        {memo.workflowSteps.length === 0 ? (
          <p className="text-sm text-slate-400">This memo hasn't been submitted yet.</p>
        ) : (
          <WorkflowTimeline steps={memo.workflowSteps} currentStepIndex={memo.currentStepIndex} />
        )}
      </Card>

      <Card className="p-6">
        <h2 className="font-semibold text-slate-700 mb-4">Attachments</h2>
        <div className="space-y-2 mb-4">
          {memo.attachments.length === 0 && <p className="text-sm text-slate-400">No attachments</p>}
          {memo.attachments.map((att) => (
            <div key={att.id} className="flex items-center justify-between text-sm bg-slate-50 rounded-md px-3 py-2">
              <div>
                <button onClick={() => downloadAttachment(att.id, att.fileName)} className="text-brand-600 hover:underline font-medium">
                  {att.fileName}
                </button>
                <span className="text-slate-400 ml-2">
                  {(att.fileSize / 1024).toFixed(0)} KB · {att.uploadedBy.name}
                </span>
              </div>
            </div>
          ))}
        </div>
        <label className="inline-block">
          <span className="text-sm text-brand-600 cursor-pointer hover:underline">{uploading ? 'Uploading…' : '+ Upload file'}</span>
          <input type="file" className="hidden" onChange={handleFileUpload} disabled={uploading} />
        </label>
      </Card>

      {memo.versions.length > 0 && (
        <Card className="p-6">
          <h2 className="font-semibold text-slate-700 mb-4">Previous Versions</h2>
          <p className="text-xs text-slate-400 mb-3">
            Snapshots saved automatically whenever this memo was edited after being returned for changes.
          </p>
          <div className="space-y-3">
            {memo.versions.map((v) => (
              <details key={v.id} className="bg-slate-50 rounded-md px-3 py-2">
                <summary className="text-sm font-medium text-slate-600 cursor-pointer">
                  Version {v.versionNumber} — {new Date(v.createdAt).toLocaleString()}
                </summary>
                <div className="mt-2 text-sm text-slate-600">
                  <p className="font-medium">{v.subject}</p>
                  <p className="whitespace-pre-wrap mt-1 text-slate-500">{v.body}</p>
                </div>
              </details>
            ))}
          </div>
        </Card>
      )}

      <Card className="p-6">
        <h2 className="font-semibold text-slate-700 mb-4">Comments</h2>
        <div className="space-y-3 mb-4">
          {memo.comments.length === 0 && <p className="text-sm text-slate-400">No comments yet</p>}
          {memo.comments.map((c) => (
            <div key={c.id} className="text-sm border-l-2 border-slate-200 pl-3">
              <p className="text-slate-700">{c.content}</p>
              <p className="text-xs text-slate-400 mt-0.5">
                {c.author.name} · {new Date(c.createdAt).toLocaleString()}
              </p>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <Textarea rows={2} placeholder="Add a comment…" value={commentText} onChange={(e) => setCommentText(e.target.value)} />
          <Button onClick={submitComment}>Post</Button>
        </div>
      </Card>
    </div>
  )
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      resolve(result.split(',')[1] || '')
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
