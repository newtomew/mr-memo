import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Button, Input, Label, ErrorText, Card } from '@/components/ui'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      })
      if (resetError) throw resetError
      setSent(true)
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
          <p className="text-slate-500 text-sm mt-1">Reset your password</p>
        </div>

        {sent ? (
          <div className="text-center space-y-4">
            <p className="text-sm text-slate-600">
              If an account exists for <strong>{email}</strong>, a password reset link has been sent. Check your inbox.
            </p>
            <Link to="/login" className="text-brand-600 font-medium hover:underline text-sm">
              Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
            </div>
            <ErrorText>{error}</ErrorText>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Sending…' : 'Send reset link'}
            </Button>
            <p className="text-center text-sm text-slate-500">
              <Link to="/login" className="text-brand-600 font-medium hover:underline">
                Back to sign in
              </Link>
            </p>
          </form>
        )}
      </Card>
    </div>
  )
}
