import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Button, Input, Label, ErrorText, Card, Spinner } from '@/components/ui'

export default function ResetPassword() {
  const navigate = useNavigate()
  const [ready, setReady] = useState(false)
  const [invalid, setInvalid] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    // Supabase's client parses the recovery token from the URL fragment and
    // establishes a temporary "recovery" session automatically on load.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true)
      else setInvalid(true)
    })
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) throw updateError
      setDone(true)
      setTimeout(() => navigate('/login'), 2000)
    } catch (err: any) {
      setError(err?.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-500 to-teal-500 px-4">
      <Card className="w-full max-w-md p-8">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-brand-600">mr.memo</h1>
          <p className="text-slate-500 text-sm mt-1">Set a new password</p>
        </div>

        {invalid ? (
          <p className="text-sm text-red-600 text-center">
            This reset link is invalid or has expired. Please request a new one.
          </p>
        ) : !ready ? (
          <Spinner />
        ) : done ? (
          <p className="text-sm text-emerald-600 text-center">Password updated. Redirecting to sign in…</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>New password</Label>
              <Input type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus />
            </div>
            <ErrorText>{error}</ErrorText>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Saving…' : 'Set new password'}
            </Button>
          </form>
        )}
      </Card>
    </div>
  )
}
