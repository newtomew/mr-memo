import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api, apiErrorMessage } from '@/services/api'
import { useAuthStore } from '@/store/authStore'
import { Card, Input, Button, ErrorText, Spinner, EmptyState, Select } from '@/components/ui'
import type { Conversation, Message } from '@/lib/types'

export default function Messages() {
  const user = useAuthStore((s) => s.user)
  const [searchParams, setSearchParams] = useSearchParams()
  const [conversations, setConversations] = useState<Conversation[] | null>(null)
  const [activePeerId, setActivePeerId] = useState<string | null>(searchParams.get('with'))
  const [orgUsers, setOrgUsers] = useState<{ id: string; name: string }[]>([])
  const [newTo, setNewTo] = useState('')
  const [error, setError] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  async function loadConversations() {
    const res = await api.get('/messages')
    setConversations(res.data.data.conversations)
  }

  useEffect(() => {
    loadConversations()
    api.get('/users').then((res) => setOrgUsers(res.data.data.users))
  }, [])

  useEffect(() => {
    if (activePeerId) setSearchParams({ with: activePeerId })
    else setSearchParams({})
  }, [activePeerId]) // eslint-disable-line react-hooks/exhaustive-deps

  function startNewConversation() {
    if (!newTo) return
    setActivePeerId(newTo)
    setNewTo('')
  }

  return (
    <div className="max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-800 mb-4">Messages</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4" style={{ minHeight: '60vh' }}>
        <Card className="p-0 md:col-span-1 overflow-hidden flex flex-col">
          <div className="p-3 border-b border-slate-100 flex gap-2">
            <Select value={newTo} onChange={(e) => setNewTo(e.target.value)} className="text-xs">
              <option value="">New message to…</option>
              {orgUsers.filter((u) => u.id !== user?.id).map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
            <Button variant="secondary" onClick={startNewConversation}>
              Go
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {conversations === null ? (
              <Spinner />
            ) : conversations.length === 0 ? (
              <EmptyState message="No conversations yet" />
            ) : (
              conversations.map((c) => (
                <button
                  key={c.peer.id}
                  onClick={() => setActivePeerId(c.peer.id)}
                  className={`w-full text-left px-4 py-3 border-b border-slate-100 hover:bg-slate-50 ${
                    activePeerId === c.peer.id ? 'bg-brand-50' : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-sm text-slate-700">{c.peer.name}</p>
                    {c.unread > 0 && (
                      <span className="bg-brand-500 text-white text-[10px] rounded-full h-4 min-w-4 px-1 flex items-center justify-center">
                        {c.unread}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 truncate mt-0.5">{c.lastMessage.content}</p>
                </button>
              ))
            )}
          </div>
        </Card>

        <Card className="p-0 md:col-span-2 overflow-hidden flex flex-col">
          {activePeerId ? (
            <Thread
              peerId={activePeerId}
              onSent={loadConversations}
              bottomRef={bottomRef}
              setError={setError}
            />
          ) : (
            <EmptyState message="Select a conversation, or start a new one" />
          )}
        </Card>
      </div>
      <ErrorText>{error}</ErrorText>
    </div>
  )
}

function Thread({
  peerId,
  onSent,
  bottomRef,
  setError,
}: {
  peerId: string
  onSent: () => void
  bottomRef: React.RefObject<HTMLDivElement | null>
  setError: (s: string) => void
}) {
  const [otherUser, setOtherUser] = useState<{ id: string; name: string } | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    try {
      const res = await api.get(`/messages/${peerId}`)
      setOtherUser(res.data.data.otherUser)
      setMessages(res.data.data.messages)
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    const interval = setInterval(load, 8000)
    return () => clearInterval(interval)
  }, [peerId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length]) // eslint-disable-line react-hooks/exhaustive-deps

  async function send(e: React.FormEvent) {
    e.preventDefault()
    if (!text.trim()) return
    setSending(true)
    try {
      await api.post('/messages', { recipientId: peerId, content: text })
      setText('')
      await load()
      onSent()
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setSending(false)
    }
  }

  if (loading && messages.length === 0) return <Spinner />

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-slate-100 font-medium text-slate-700">{otherUser?.name}</div>
      <div className="flex-1 overflow-y-auto p-4 space-y-2" style={{ maxHeight: '48vh' }}>
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.senderId === peerId ? 'justify-start' : 'justify-end'}`}>
            <div
              className={`max-w-xs px-3 py-2 rounded-lg text-sm ${
                m.senderId === peerId ? 'bg-slate-100 text-slate-700' : 'bg-brand-500 text-white'
              }`}
            >
              {m.content}
              <p className={`text-[10px] mt-1 ${m.senderId === peerId ? 'text-slate-400' : 'text-brand-100'}`}>
                {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <form onSubmit={send} className="p-3 border-t border-slate-100 flex gap-2">
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a message…" />
        <Button type="submit" disabled={sending}>
          Send
        </Button>
      </form>
    </div>
  )
}
