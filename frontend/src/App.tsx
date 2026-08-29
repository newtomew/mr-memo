import { useEffect, Suspense, lazy } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { ProtectedRoute, AdminRoute } from '@/components/ProtectedRoute'
import { Layout } from '@/components/Layout'
import { Spinner } from '@/components/ui'

// Route-level code splitting: each page ships as its own chunk instead of
// one ~1.1MB bundle, so the first paint only needs Login (or the shell +
// Dashboard) rather than the whole app — a real driver of Issue 1's slow
// "get started" complaint alongside the Tokyo-region fix in vercel.json.
const Login = lazy(() => import('@/pages/Login'))
const Register = lazy(() => import('@/pages/Register'))
const ForgotPassword = lazy(() => import('@/pages/ForgotPassword'))
const ResetPassword = lazy(() => import('@/pages/ResetPassword'))
const Dashboard = lazy(() => import('@/pages/Dashboard'))
const Inbox = lazy(() => import('@/pages/Inbox'))
const MyMemos = lazy(() => import('@/pages/MyMemos'))
const CreateMemo = lazy(() => import('@/pages/CreateMemo'))
const MemoDetail = lazy(() => import('@/pages/MemoDetail'))
const SearchPage = lazy(() => import('@/pages/SearchPage'))
const Profile = lazy(() => import('@/pages/Profile'))
const NotFound = lazy(() => import('@/pages/NotFound'))
const Unauthorized = lazy(() => import('@/pages/Unauthorized'))
const AdminLayout = lazy(() => import('@/pages/admin/AdminLayout'))
const AdminDashboard = lazy(() => import('@/pages/admin/AdminDashboard'))
const AdminUsers = lazy(() => import('@/pages/admin/AdminUsers'))
const AdminDepartments = lazy(() => import('@/pages/admin/AdminDepartments'))
const AdminCategories = lazy(() => import('@/pages/admin/AdminCategories'))
const AdminTemplates = lazy(() => import('@/pages/admin/AdminTemplates'))
const AdminAuditLog = lazy(() => import('@/pages/admin/AdminAuditLog'))

export default function App() {
  const { hydrate, isHydrated } = useAuthStore()

  useEffect(() => {
    hydrate()
  }, [hydrate])

  if (!isHydrated) return <Spinner />

  return (
    <BrowserRouter>
      <Suspense fallback={<Spinner />}>
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
      </Suspense>
    </BrowserRouter>
  )
}
