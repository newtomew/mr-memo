import { useEffect, useMemo, useState } from 'react'
import { api } from '@/services/api'
import { Spinner, Select } from '@/components/ui'
import { MemoTable } from '@/components/MemoTable'
import type { Memo, MemoPriority } from '@/lib/types'

type SortKey = 'oldest' | 'newest' | 'priority'

export default function Inbox() {
  const [memos, setMemos] = useState<Memo[] | null>(null)
  const [priorityFilter, setPriorityFilter] = useState<MemoPriority | ''>('')
  const [sort, setSort] = useState<SortKey>('oldest')

  useEffect(() => {
    api.get('/memos', { params: { scope: 'inbox' } }).then((res) => setMemos(res.data.data.memos))
  }, [])

  const visible = useMemo(() => {
    if (!memos) return []
    let list = priorityFilter ? memos.filter((m) => m.priority === priorityFilter) : memos
    const priorityRank = { URGENT: 0, HIGH: 1, NORMAL: 2 }
    list = [...list].sort((a, b) => {
      if (sort === 'priority') return priorityRank[a.priority] - priorityRank[b.priority]
      const at = a.submittedAt ? new Date(a.submittedAt).getTime() : 0
      const bt = b.submittedAt ? new Date(b.submittedAt).getTime() : 0
      return sort === 'oldest' ? at - bt : bt - at
    })
    return list
  }, [memos, priorityFilter, sort])

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Inbox</h1>
          <p className="text-slate-500 text-sm">Memos awaiting your review.</p>
        </div>
        <div className="flex gap-2">
          <Select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value as MemoPriority | '')} className="w-40">
            <option value="">All priorities</option>
            <option value="URGENT">Urgent</option>
            <option value="HIGH">High</option>
            <option value="NORMAL">Normal</option>
          </Select>
          <Select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="w-44">
            <option value="oldest">Oldest submitted first</option>
            <option value="newest">Newest submitted first</option>
            <option value="priority">Priority (urgent first)</option>
          </Select>
        </div>
      </div>
      {memos === null ? <Spinner /> : <MemoTable memos={visible} emptyMessage="Your inbox is empty" showInboxColumns />}
    </div>
  )
}
