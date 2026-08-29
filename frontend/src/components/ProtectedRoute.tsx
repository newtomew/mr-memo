import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'

export function ProtectedRoute() {
  const { user, accessToken } = useAuthStore()
  if (!user || !accessToken) return <Navigate to="/login" replace />
  return <Outlet />
}

export function AdminRoute() {
  const { user } = useAuthStore()
  if (!user) return <Navigate to="/login" replace />
  if (user.role !== 'ADMIN') return <Navigate to="/unauthorized" replace />
  return <Outlet />
}
