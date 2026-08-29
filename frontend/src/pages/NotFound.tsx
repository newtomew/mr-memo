import { Link } from 'react-router-dom'
import { Button } from '@/components/ui'

export default function NotFound() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center gap-4">
      <h1 className="text-5xl font-bold text-slate-300">404</h1>
      <p className="text-slate-500">Page not found</p>
      <Link to="/">
        <Button>Back to Dashboard</Button>
      </Link>
    </div>
  )
}
