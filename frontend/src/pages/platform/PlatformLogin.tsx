import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { platformApi } from '@/services/platformApi'
import { apiErrorMessage } from '@/services/api'
import { usePlatformAuthStore } from '@/store/platformAuthStore'
import { Button, Input, Label, ErrorText, Card } from '@/components/ui'

export default function PlatformLogin() {
  const navigate = useNavigate()
  const setSession = usePlatformAuthStore((s) => s.setSession)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await platformApi.post('/platform/login', { email, password })
      const { session, admin } = res.data.data
      setSession(admin, session.accessToken)
      navigate('/platform')
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900 px-4">
      <Card className="w-full max-w-md p-8">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-slate-800">mr.memo</h1>
          <p className="text-slate-500 text-sm mt-1">Platform Administrator sign-in</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          </div>
          <div>
            <Label>Password</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <ErrorText>{error}</ErrorText>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      </Card>
    </div>
  )
}
