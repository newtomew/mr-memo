import { useEffect, useState } from 'react'
import { api } from '@/services/api'
import { Spinner } from '@/components/ui'
import { MemoTable } from '@/components/MemoTable'
import type { Memo, MemoStatus } from '@/lib/types'

const TABS: { key: string; label: string; status?: MemoStatus[] }[] = [
  { key: 'all', label: 'All' },
  { key: 'draft', label: 'Drafts', status: ['DRAFT'] },
  { key: 'active', label: 'In Progress', status: ['SUBMITTED', 'PENDING_REVIEW', 'PENDING_APPROVAL', 'CHANGES_REQUESTED'] },
  { key: 'done', label: 'Completed', status: ['APPROVED', 'REJECTED'] },
]

export default function MyMemos() {
  const [memos, setMemos] = useState<Memo[] | null>(null)
  const [tab, setTab] = useState('all')

  useEffect(() => {
    api.get('/memos', { params: { scope: 'mine' } }).then((res) => setMemos(res.data.data.memos))
  }, [])

  const activeTab = TABS.find((t) => t.key === tab)
  const filtered = memos?.filter((m) => !activeTab?.status || activeTab.status.includes(m.status)) || []

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">My Memos</h1>
        <p className="text-slate-500 text-sm">Memos you've authored.</p>
      </div>

      <div className="flex gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${
              tab === t.key ? 'border-brand-500 text-brand-600' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {memos === null ? <Spinner /> : <MemoTable memos={filtered} emptyMessage="No memos in this category" />}
    </div>
  )
}
