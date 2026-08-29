import { Link } from 'react-router-dom'
import { Button } from '@/components/ui'

export default function Unauthorized() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center gap-4">
      <h1 className="text-3xl font-bold text-slate-700">🔒 Access Denied</h1>
      <p className="text-slate-500">You don't have permission to view this page.</p>
      <Link to="/">
        <Button>Back to Dashboard</Button>
      </Link>
    </div>
  )
}
