import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, apiErrorMessage } from '@/services/api'
import { Button, Input, Label, ErrorText, Card } from '@/components/ui'

export default function Register() {
  const navigate = useNavigate()
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
      navigate('/login')
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-500 to-teal-500 px-4">
      <Card className="w-full max-w-md p-8">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-brand-600">mr.memo</h1>
          <p className="text-slate-500 text-sm mt-1">Create your organization</p>
        </div>

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
        </form>

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
