import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, apiErrorMessage } from '@/services/api'
import { useAuthStore } from '@/store/authStore'
import { Button, Input, Label, ErrorText, Card } from '@/components/ui'

export default function Login() {
  const navigate = useNavigate()
  const setSession = useAuthStore((s) => s.setSession)
  const [email, setEmail] = useState('admin@demo.com')
  const [password, setPassword] = useState('Demo123!')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await api.post('/auth/login', { email, password })
      const { session, user } = res.data.data
      setSession(user, session.accessToken)
      navigate('/')
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
          <p className="text-slate-500 text-sm mt-1">Inter-office memo management</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <Label>Password</Label>
              <Link to="/forgot-password" className="text-xs text-brand-600 hover:underline">
                Forgot password?
              </Link>
            </div>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <ErrorText>{error}</ErrorText>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>

        <p className="text-center text-sm text-slate-500 mt-6">
          Need an organization?{' '}
          <Link to="/register" className="text-brand-600 font-medium hover:underline">
            Register
          </Link>
        </p>

        <div className="mt-6 pt-4 border-t border-slate-100 text-xs text-slate-400 text-center">
          Demo: admin@demo.com / Demo123!
        </div>
      </Card>
    </div>
  )
}
