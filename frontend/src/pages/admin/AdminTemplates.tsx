import { useEffect, useState } from 'react'
import { api, apiErrorMessage } from '@/services/api'
import { Card, Button, Input, Label, ErrorText, EmptyState } from '@/components/ui'

interface TemplatePosition {
  position: number
  title: string
}
interface Template {
  id: string
  name: string
  description?: string | null
  positions: TemplatePosition[]
}

export default function AdminTemplates() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [positions, setPositions] = useState<string[]>(['', ''])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  function load() {
    api.get('/admin/workflow-templates').then((res) => setTemplates(res.data.data.templates))
  }
  useEffect(load, [])

  function addPosition() {
    setPositions((p) => [...p, ''])
  }
  function updatePosition(idx: number, value: string) {
    setPositions((p) => p.map((v, i) => (i === idx ? value : v)))
  }
  function removePosition(idx: number) {
    setPositions((p) => p.filter((_, i) => i !== idx))
  }

  async function create(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const titles = positions.map((t) => t.trim()).filter(Boolean)
    if (titles.length === 0) {
      setError('Add at least one position title')
      return
    }
    setSaving(true)
    try {
      await api.post('/admin/workflow-templates', {
        name,
        description: description || undefined,
        positions: titles.map((title, i) => ({ position: i, title })),
      })
      setName('')
      setDescription('')
      setPositions(['', ''])
      setShowForm(false)
      load()
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  async function remove(id: string) {
    if (!confirm('Delete this template?')) return
    await api.delete(`/admin/workflow-templates/${id}`)
    load()
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-slate-500">Reusable approval chains — e.g. Purchase Request, Leave Request.</p>
        <Button onClick={() => setShowForm((s) => !s)}>{showForm ? 'Cancel' : '+ New template'}</Button>
      </div>

      {showForm && (
        <Card className="p-5">
          <form onSubmit={create} className="space-y-4">
            <div>
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. Purchase Request" />
            </div>
            <div>
              <Label>Description</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" />
            </div>
            <div>
              <Label>Positions (in order)</Label>
              <div className="space-y-2">
                {positions.map((p, idx) => (
                  <div key={idx} className="flex gap-2 items-center">
                    <span className="w-6 h-6 flex items-center justify-center rounded-full bg-brand-100 text-brand-600 text-xs font-bold flex-shrink-0">
                      {idx + 1}
                    </span>
                    <Input
                      value={p}
                      onChange={(e) => updatePosition(idx, e.target.value)}
                      placeholder="e.g. Department Head"
                    />
                    <button type="button" onClick={() => removePosition(idx)} className="text-red-400 hover:text-red-600 px-1">
                      ✕
                    </button>
                  </div>
                ))}
              </div>
              <Button type="button" variant="secondary" onClick={addPosition} className="mt-2">
                + Add position
              </Button>
            </div>
            <ErrorText>{error}</ErrorText>
            <Button type="submit" disabled={saving}>
              {saving ? 'Creating…' : 'Create template'}
            </Button>
          </form>
        </Card>
      )}

      {templates.length === 0 ? (
        <EmptyState message="No workflow templates yet" />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {templates.map((t) => (
            <Card key={t.id} className="p-4">
              <div className="flex justify-between items-start">
                <h3 className="font-semibold text-slate-700">{t.name}</h3>
                <button onClick={() => remove(t.id)} className="text-xs text-red-500 hover:underline">
                  Delete
                </button>
              </div>
              {t.description && <p className="text-xs text-slate-400 mt-0.5">{t.description}</p>}
              <p className="text-sm text-slate-600 mt-2">
                {t.positions
                  .slice()
                  .sort((a, b) => a.position - b.position)
                  .map((p) => p.title)
                  .join(' → ')}
              </p>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
