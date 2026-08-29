import { useState } from 'react'
import { api, apiErrorMessage } from '@/services/api'
import { useAuthStore } from '@/store/authStore'
import { Card, Input, Label, Button, ErrorText } from '@/components/ui'
import { DelegationsSection } from '@/components/DelegationsSection'

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1] || '')
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

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

  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [avatarError, setAvatarError] = useState('')

  const [newEmail, setNewEmail] = useState('')
  const [emailMessage, setEmailMessage] = useState('')
  const [emailError, setEmailError] = useState('')
  const [savingEmail, setSavingEmail] = useState(false)

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarError('')
    setUploadingAvatar(true)
    try {
      const base64Data = await fileToBase64(file)
      const res = await api.post('/auth/avatar', { mimeType: file.type, base64Data })
      updateUser(res.data.data.user)
    } catch (err) {
      setAvatarError(apiErrorMessage(err))
    } finally {
      setUploadingAvatar(false)
      e.target.value = ''
    }
  }

  async function changeEmail(e: React.FormEvent) {
    e.preventDefault()
    setEmailError('')
    setEmailMessage('')
    setSavingEmail(true)
    try {
      const res = await api.put('/auth/email', { newEmail })
      updateUser(res.data.data.user)
      setEmailMessage('Email updated')
      setNewEmail('')
    } catch (err) {
      setEmailError(apiErrorMessage(err))
    } finally {
      setSavingEmail(false)
    }
  }

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
        <div className="flex items-center gap-4 mb-2">
          {user.avatarUrl ? (
            <img src={user.avatarUrl} alt={user.name} className="w-16 h-16 rounded-full object-cover border border-slate-200" />
          ) : (
            <div className="w-16 h-16 rounded-full bg-brand-100 text-brand-600 flex items-center justify-center text-xl font-semibold">
              {user.name[0]?.toUpperCase()}
            </div>
          )}
          <div>
            <label className="inline-block">
              <span className="text-sm text-brand-600 cursor-pointer hover:underline">
                {uploadingAvatar ? 'Uploading…' : 'Change photo'}
              </span>
              <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} disabled={uploadingAvatar} />
            </label>
            <ErrorText>{avatarError}</ErrorText>
          </div>
        </div>
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
        <h2 className="font-semibold text-slate-700 mb-3">Change email</h2>
        <form onSubmit={changeEmail} className="space-y-3">
          <div>
            <Label>New email</Label>
            <Input
              type="email"
              placeholder={user.email}
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              required
            />
          </div>
          {emailMessage && <p className="text-sm text-emerald-600">{emailMessage}</p>}
          <ErrorText>{emailError}</ErrorText>
          <Button type="submit" disabled={savingEmail}>
            {savingEmail ? 'Saving…' : 'Update email'}
          </Button>
        </form>
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
