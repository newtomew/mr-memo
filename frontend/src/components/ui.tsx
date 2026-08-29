import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'

export function Button({
  variant = 'primary',
  className = '',
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'ghost' }) {
  const styles = {
    primary: 'bg-brand-500 hover:bg-brand-600 text-white',
    secondary: 'bg-slate-100 hover:bg-slate-200 text-slate-700',
    danger: 'bg-red-500 hover:bg-red-600 text-white',
    ghost: 'hover:bg-slate-100 text-slate-600',
  }
  return (
    <button
      className={`px-4 py-2 rounded-md text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed ${styles[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent ${props.className || ''}`}
    />
  )
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent ${props.className || ''}`}
    />
  )
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`w-full px-3 py-2 border border-slate-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent ${props.className || ''}`}
    />
  )
}

export function Label({ children }: { children: ReactNode }) {
  return <label className="block text-sm font-medium text-slate-700 mb-1">{children}</label>
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`bg-white rounded-xl border border-slate-200 shadow-sm ${className}`}>{children}</div>
}

export function StatTile({ label, value, accent = 'brand' }: { label: string; value: number | string; accent?: 'brand' | 'teal' | 'red' | 'amber' }) {
  const colors = {
    brand: 'text-brand-600',
    teal: 'text-teal-600',
    red: 'text-red-600',
    amber: 'text-amber-600',
  }
  return (
    <Card className="p-5">
      <p className="text-sm text-slate-500">{label}</p>
      <p className={`text-3xl font-bold mt-1 ${colors[accent]}`}>{value}</p>
    </Card>
  )
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null
  return <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{children}</p>
}

export function Spinner() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="w-8 h-8 border-4 border-brand-200 border-t-brand-500 rounded-full animate-spin" />
    </div>
  )
}

export function EmptyState({ message }: { message: string }) {
  return <div className="text-center py-12 text-slate-400 text-sm">{message}</div>
}
