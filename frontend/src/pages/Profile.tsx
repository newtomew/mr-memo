import { useState } from 'react'
import { api, apiErrorMessage } from '@/services/api'
import { useAuthStore } from '@/store/authStore'
import { Card, Input, Label, Button, ErrorText } from '@/components/ui'
import { DelegationsSection } from '@/components/DelegationsSection'

export default function Profile() {
  const user = useAuthStore((s) => s.user)
  const updateUser = useAuthStore((s) => s.updateUser)

  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(user?.name || '')
  const [designation, setDesignation] = useState(user?.designation || '')
  const [profileMessage, setProfileMessage] = useState('')
  const [profileError, setProfileError] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)

  const [newPassword, setNewPassword] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault()
    setProfileError('')
    setProfileMessage('')
    setSavingProfile(true)
    try {
      const res = await api.put('/auth/profile', { name, designation })
      updateUser(res.data.data.user)
      setProfileMessage('Profile updated')
      setEditing(false)
    } catch (err) {
      setProfileError(apiErrorMessage(err))
    } finally {
      setSavingProfile(false)
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setMessage('')
    setSaving(true)
    try {
      await api.post('/auth/change-password', { newPassword })
      setMessage('Password updated successfully')
      setNewPassword('')
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  if (!user) return null

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-slate-800">Profile</h1>

      <Card className="p-6 space-y-3">
        {editing ? (
          <form onSubmit={saveProfile} className="space-y-3">
            <div>
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div>
              <Label>Designation</Label>
              <Input value={designation} onChange={(e) => setDesignation(e.target.value)} placeholder="e.g. Software Engineer" />
            </div>
            <ErrorText>{profileError}</ErrorText>
            <div className="flex gap-2">
              <Button type="submit" disabled={savingProfile}>
                {savingProfile ? 'Saving…' : 'Save'}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <>
            <div>
              <Label>Name</Label>
              <p className="text-slate-700">{user.name}</p>
            </div>
            <div>
              <Label>Email</Label>
              <p className="text-slate-700">{user.email}</p>
            </div>
            <div>
              <Label>Designation</Label>
              <p className="text-slate-700">{user.designation || '—'}</p>
            </div>
            <div>
              <Label>Department</Label>
              <p className="text-slate-700">{user.department?.name || '—'}</p>
            </div>
            <div>
              <Label>Role</Label>
              <p className="text-slate-700">{user.role === 'ADMIN' ? 'Organization Administrator' : 'Regular User'}</p>
            </div>
            {profileMessage && <p className="text-sm text-emerald-600">{profileMessage}</p>}
            <Button
              variant="secondary"
              onClick={() => {
                setName(user.name)
                setDesignation(user.designation || '')
                setEditing(true)
              }}
            >
              Edit profile
            </Button>
          </>
        )}
      </Card>

      <Card className="p-6">
        <h2 className="font-semibold text-slate-700 mb-3">Change password</h2>
        <form onSubmit={changePassword} className="space-y-3">
          <div>
            <Label>New password</Label>
            <Input type="password" minLength={8} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
          </div>
          {message && <p className="text-sm text-emerald-600">{message}</p>}
          <ErrorText>{error}</ErrorText>
          <Button type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Update password'}
          </Button>
        </form>
      </Card>

      <DelegationsSection currentUserId={user.id} />
    </div>
  )
}
