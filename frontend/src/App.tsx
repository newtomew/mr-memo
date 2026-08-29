import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { ProtectedRoute, AdminRoute } from '@/components/ProtectedRoute'
import { Layout } from '@/components/Layout'
import { Spinner } from '@/components/ui'

import Login from '@/pages/Login'
import Register from '@/pages/Register'
import ForgotPassword from '@/pages/ForgotPassword'
import ResetPassword from '@/pages/ResetPassword'
import Dashboard from '@/pages/Dashboard'
import Inbox from '@/pages/Inbox'
import MyMemos from '@/pages/MyMemos'
import CreateMemo from '@/pages/CreateMemo'
import MemoDetail from '@/pages/MemoDetail'
import SearchPage from '@/pages/SearchPage'
import Profile from '@/pages/Profile'
import NotFound from '@/pages/NotFound'
import Unauthorized from '@/pages/Unauthorized'
import AdminLayout from '@/pages/admin/AdminLayout'
import AdminDashboard from '@/pages/admin/AdminDashboard'
import AdminUsers from '@/pages/admin/AdminUsers'
import AdminDepartments from '@/pages/admin/AdminDepartments'
import AdminCategories from '@/pages/admin/AdminCategories'
import AdminTemplates from '@/pages/admin/AdminTemplates'
import AdminAuditLog from '@/pages/admin/AdminAuditLog'

export default function App() {
  const { hydrate, isHydrated } = useAuthStore()

  useEffect(() => {
    hydrate()
  }, [hydrate])

  if (!isHydrated) return <Spinner />

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/unauthorized" element={<Unauthorized />} />

        <Route element={<ProtectedRoute />}>
          <Route element={<Layout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/memos/inbox" element={<Inbox />} />
            <Route path="/memos/mine" element={<MyMemos />} />
            <Route path="/memos/new" element={<CreateMemo />} />
            <Route path="/memos/:id" element={<MemoDetail />} />
            <Route path="/memos/:id/edit" element={<CreateMemo />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/profile" element={<Profile />} />

            <Route element={<AdminRoute />}>
              <Route path="/admin" element={<AdminLayout />}>
                <Route index element={<AdminDashboard />} />
                <Route path="users" element={<AdminUsers />} />
                <Route path="departments" element={<AdminDepartments />} />
                <Route path="categories" element={<AdminCategories />} />
                <Route path="templates" element={<AdminTemplates />} />
                <Route path="audit-log" element={<AdminAuditLog />} />
              </Route>
            </Route>
          </Route>
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  )
}
