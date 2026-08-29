import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, apiErrorMessage } from '@/services/api'
import { Button, Input, Label, ErrorText, Card, Select } from '@/components/ui'

type Mode = 'create' | 'join'

export default function Register() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>('create')

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-500 to-teal-500 px-4 py-8">
      <Card className="w-full max-w-md p-8">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-brand-600">mr.memo</h1>
          <p className="text-slate-500 text-sm mt-1">
            {mode === 'create' ? 'Create your organization' : 'Join an existing organization'}
          </p>
        </div>

        <div className="flex rounded-md bg-slate-100 p-1 mb-6 text-sm font-medium">
          <button
            className={`flex-1 py-1.5 rounded ${mode === 'create' ? 'bg-white shadow-sm text-brand-600' : 'text-slate-500'}`}
            onClick={() => setMode('create')}
          >
            New organization
          </button>
          <button
            className={`flex-1 py-1.5 rounded ${mode === 'join' ? 'bg-white shadow-sm text-brand-600' : 'text-slate-500'}`}
            onClick={() => setMode('join')}
          >
            Join existing
          </button>
        </div>

        {mode === 'create' ? <CreateOrgForm onDone={() => navigate('/login')} /> : <JoinOrgForm />}

        <p className="text-center text-sm text-slate-500 mt-6">
          Already have an account?{' '}
          <Link to="/login" className="text-brand-600 font-medium hover:underline">
            Sign in
          </Link>
        </p>
      </Card>
    </div>
  )
}

function CreateOrgForm({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState({ organizationName: '', name: '', email: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function update(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await api.post('/auth/register', form)
      onDone()
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label>Organization name</Label>
        <Input value={form.organizationName} onChange={(e) => update('organizationName', e.target.value)} required autoFocus />
      </div>
      <div>
        <Label>Your name</Label>
        <Input value={form.name} onChange={(e) => update('name', e.target.value)} required />
      </div>
      <div>
        <Label>Email</Label>
        <Input type="email" value={form.email} onChange={(e) => update('email', e.target.value)} required />
      </div>
      <div>
        <Label>Password</Label>
        <Input type="password" minLength={8} value={form.password} onChange={(e) => update('password', e.target.value)} required />
      </div>
      <ErrorText>{error}</ErrorText>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? 'Creating…' : 'Create organization'}
      </Button>
      <p className="text-xs text-slate-400 text-center">You become this organization's Administrator immediately.</p>
    </form>
  )
}

function JoinOrgForm() {
  const [orgQuery, setOrgQuery] = useState('')
  const [orgs, setOrgs] = useState<{ id: string; name: string; slug: string }[]>([])
  const [form, setForm] = useState({ organizationId: '', name: '', email: '', password: '', requestedRole: 'USER' as 'USER' | 'MANAGER' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState<string | null>(null)

  useEffect(() => {
    const handle = setTimeout(() => {
      api.get('/auth/organizations', { params: orgQuery ? { q: orgQuery } : {} }).then((res) => setOrgs(res.data.data.organizations))
    }, 250)
    return () => clearTimeout(handle)
  }, [orgQuery])

  function update(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!form.organizationId) {
      setError('Select an organization to join')
      return
    }
    setLoading(true)
    try {
      const res = await api.post('/auth/join', form)
      setSubmitted(res.data.data.message)
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  if (submitted) {
    return (
      <div className="text-center space-y-4">
        <p className="text-sm text-slate-600">{submitted}</p>
        <Link to="/login" className="text-brand-600 font-medium hover:underline text-sm">
          Back to sign in
        </Link>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label>Organization</Label>
        <Input
          placeholder="Search by name…"
          value={orgQuery}
          onChange={(e) => {
            setOrgQuery(e.target.value)
            setForm((f) => ({ ...f, organizationId: '' }))
          }}
        />
        {orgQuery && orgs.length > 0 && !form.organizationId && (
          <div className="mt-1 border border-slate-200 rounded-md divide-y divide-slate-100 max-h-40 overflow-y-auto">
            {orgs.map((o) => (
              <button
                key={o.id}
                type="button"
                className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50"
                onClick={() => {
                  update('organizationId', o.id)
                  setOrgQuery(o.name)
                }}
              >
                {o.name}
              </button>
            ))}
          </div>
        )}
        {form.organizationId && <p className="text-xs text-emerald-600 mt-1">Selected ✓</p>}
      </div>
      <div>
        <Label>Join as</Label>
        <Select value={form.requestedRole} onChange={(e) => update('requestedRole', e.target.value)}>
          <option value="USER">Employee</option>
          <option value="MANAGER">Manager</option>
        </Select>
        <p className="text-xs text-slate-400 mt-1">
          {form.requestedRole === 'MANAGER'
            ? "A platform administrator reviews Manager requests."
            : "The organization's Admin or a Manager reviews Employee requests."}
        </p>
      </div>
      <div>
        <Label>Your name</Label>
        <Input value={form.name} onChange={(e) => update('name', e.target.value)} required />
      </div>
      <div>
        <Label>Email</Label>
        <Input type="email" value={form.email} onChange={(e) => update('email', e.target.value)} required />
      </div>
      <div>
        <Label>Password</Label>
        <Input type="password" minLength={8} value={form.password} onChange={(e) => update('password', e.target.value)} required />
      </div>
      <ErrorText>{error}</ErrorText>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? 'Submitting…' : 'Request to join'}
      </Button>
    </form>
  )
}
