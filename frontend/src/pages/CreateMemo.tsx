import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api, apiErrorMessage } from '@/services/api'
import { useAuthStore } from '@/store/authStore'
import { Button, Input, Textarea, Select, Label, ErrorText, Card, Spinner } from '@/components/ui'
import type { Department, MemoCategory, MemoPriority } from '@/lib/types'

interface OrgUser {
  id: string
  name: string
  email: string
}

interface ApproverRow {
  userId: string
  title: string
}

interface WorkflowTemplate {
  id: string
  name: string
  positions: { position: number; title: string }[]
}

export default function CreateMemo() {
  const navigate = useNavigate()
  const { id: editId } = useParams<{ id: string }>()
  const currentUser = useAuthStore((s) => s.user)

  const [departments, setDepartments] = useState<Department[]>([])
  const [categories, setCategories] = useState<MemoCategory[]>([])
  const [users, setUsers] = useState<OrgUser[]>([])

  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [priority, setPriority] = useState<MemoPriority>('NORMAL')

  const [memoId, setMemoId] = useState<string | null>(editId || null)
  const [approvers, setApprovers] = useState<ApproverRow[]>([])
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [loadingExisting, setLoadingExisting] = useState(!!editId)

  useEffect(() => {
    api.get('/admin/departments').then((res) => setDepartments(res.data.data.departments))
    api.get('/admin/categories').then((res) => setCategories(res.data.data.categories))
    api
      .get('/users')
      .then((res) => setUsers(res.data.data.users.filter((u: OrgUser) => u.id !== currentUser?.id)))
      .catch(() => setUsers([]))
    api.get('/admin/workflow-templates').then((res) => setTemplates(res.data.data.templates))
  }, [currentUser?.id])

  function applyTemplate(templateId: string) {
    setSelectedTemplateId(templateId)
    const template = templates.find((t) => t.id === templateId)
    if (!template) return
    setApprovers(
      template.positions
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((p) => ({ userId: '', title: p.title }))
    )
  }

  useEffect(() => {
    if (!editId) return
    api.get(`/memos/${editId}`).then((res) => {
      const memo = res.data.data.memo
      setSubject(memo.subject)
      setBody(memo.body)
      setDepartmentId(memo.department?.id || '')
      setCategoryId(memo.category?.id || '')
      setPriority(memo.priority)
      setApprovers(
        memo.workflowSteps
          .sort((a: any, b: any) => a.position - b.position)
          .map((s: any) => ({ userId: s.approver.id, title: s.title || '' }))
      )
      setLoadingExisting(false)
    })
  }, [editId])

  async function saveDraft(): Promise<string | null> {
    if (!subject.trim() || !body.trim()) {
      setError('Subject and body are required')
      return null
    }
    setError('')
    setSaving(true)
    try {
      if (memoId) {
        await api.put(`/memos/${memoId}`, {
          subject,
          body,
          departmentId: departmentId || null,
          categoryId: categoryId || null,
          priority,
        })
        return memoId
      }
      const res = await api.post('/memos', {
        subject,
        body,
        departmentId: departmentId || null,
        categoryId: categoryId || null,
        priority,
      })
      const id = res.data.data.memo.id
      setMemoId(id)
      return id
    } catch (err) {
      setError(apiErrorMessage(err))
      return null
    } finally {
      setSaving(false)
    }
  }

  function addApprover() {
    setApprovers((prev) => [...prev, { userId: '', title: '' }])
  }

  function updateApprover(idx: number, field: keyof ApproverRow, value: string) {
    setApprovers((prev) => prev.map((a, i) => (i === idx ? { ...a, [field]: value } : a)))
  }

  function removeApprover(idx: number) {
    setApprovers((prev) => prev.filter((_, i) => i !== idx))
  }

  function moveApprover(idx: number, dir: -1 | 1) {
    setApprovers((prev) => {
      const next = [...prev]
      const target = idx + dir
      if (target < 0 || target >= next.length) return prev
      ;[next[idx], next[target]] = [next[target], next[idx]]
      return next
    })
  }

  async function handleSubmit() {
    setError('')
    if (approvers.length === 0 || approvers.some((a) => !a.userId)) {
      setError('Add at least one approver and make sure each row has a person selected')
      return
    }
    const id = await saveDraft()
    if (!id) return

    setSubmitting(true)
    try {
      await api.post(`/memos/${id}/submit`, {
        approvers: approvers.map((a) => ({ userId: a.userId, title: a.title || undefined })),
      })
      navigate(`/memos/${id}`)
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  if (loadingExisting) return <Spinner />

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">{editId ? 'Edit & Resubmit Memo' : 'Create Memo'}</h1>
        <p className="text-slate-500 text-sm">Draft your memo, then define who needs to review it.</p>
      </div>

      <Card className="p-6 space-y-4">
        <h2 className="font-semibold text-slate-700">1. Memo details</h2>
        <div>
          <Label>Subject</Label>
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Request: 5 new laptops for Q3" />
        </div>
        <div>
          <Label>Body</Label>
          <Textarea rows={6} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Describe your request in detail…" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <Label>Department</Label>
            <Select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
              <option value="">— None —</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Category</Label>
            <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">— None —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Priority</Label>
            <Select value={priority} onChange={(e) => setPriority(e.target.value as MemoPriority)}>
              <option value="NORMAL">Normal</option>
              <option value="HIGH">High</option>
              <option value="URGENT">Urgent</option>
            </Select>
          </div>
        </div>
        <Button variant="secondary" onClick={saveDraft} disabled={saving}>
          {saving ? 'Saving…' : memoId ? 'Draft saved ✓' : 'Save as draft'}
        </Button>
      </Card>

      <Card className="p-6 space-y-4">
        <h2 className="font-semibold text-slate-700">2. Approval workflow</h2>
        <p className="text-sm text-slate-500">Add reviewers in the order they should approve.</p>

        {templates.length > 0 && (
          <div>
            <Label>Start from a template (optional)</Label>
            <Select value={selectedTemplateId} onChange={(e) => applyTemplate(e.target.value)}>
              <option value="">— Build manually —</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.positions.length} step{t.positions.length === 1 ? '' : 's'})
                </option>
              ))}
            </Select>
            <p className="text-xs text-slate-400 mt-1">Fills in the position titles — assign a person to each below.</p>
          </div>
        )}

        {approvers.map((a, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <span className="w-6 h-6 flex items-center justify-center rounded-full bg-brand-100 text-brand-600 text-xs font-bold">
              {idx + 1}
            </span>
            <Select value={a.userId} onChange={(e) => updateApprover(idx, 'userId', e.target.value)} className="flex-1">
              <option value="">Select a person…</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.email})
                </option>
              ))}
            </Select>
            <Input
              placeholder="Title (optional)"
              value={a.title}
              onChange={(e) => updateApprover(idx, 'title', e.target.value)}
              className="w-40"
            />
            <button onClick={() => moveApprover(idx, -1)} className="text-slate-400 hover:text-slate-600 px-1" title="Move up">
              ↑
            </button>
            <button onClick={() => moveApprover(idx, 1)} className="text-slate-400 hover:text-slate-600 px-1" title="Move down">
              ↓
            </button>
            <button onClick={() => removeApprover(idx)} className="text-red-400 hover:text-red-600 px-1" title="Remove">
              ✕
            </button>
          </div>
        ))}

        <Button variant="secondary" onClick={addApprover}>
          + Add approver
        </Button>

        <ErrorText>{error}</ErrorText>

        <div className="flex gap-3 pt-2 border-t border-slate-100">
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Submitting…' : 'Submit for approval'}
          </Button>
        </div>
      </Card>
    </div>
  )
}
