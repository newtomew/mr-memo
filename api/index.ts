import type { VercelRequest, VercelResponse } from '@vercel/node'
import { applyCors } from './_lib/cors'
import { fail } from './_lib/response'

import * as authH from './_auth/handlers'
import * as memoH from './_memos/handlers'
import * as workflowH from './_workflow/handlers'
import * as commentH from './_comments/handlers'
import * as attachmentH from './_attachments/handlers'
import * as notificationH from './_notifications/handlers'
import * as searchH from './_search/handlers'
import * as adminH from './_admin/handlers'
import * as delegationH from './_delegations/handlers'

/**
 * Single catch-all Vercel serverless function. All /api/* traffic is routed
 * here (see vercel.json rewrites) and dispatched based on path + method.
 * This keeps us under Vercel's per-plan serverless function count limit.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return

  const url = new URL(req.url || '/', 'http://localhost')
  const segments = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean)
  const method = req.method || 'GET'

  try {
    // ---- /api/auth/* ----
    if (segments[0] === 'auth') {
      if (segments[1] === 'register' && method === 'POST') return authH.register(req, res)
      if (segments[1] === 'login' && method === 'POST') return authH.login(req, res)
      if (segments[1] === 'logout' && method === 'POST') return authH.logout(req, res)
      if (segments[1] === 'me' && method === 'GET') return authH.me(req, res)
      if (segments[1] === 'change-password' && method === 'POST') return authH.changePassword(req, res)
      if (segments[1] === 'profile' && method === 'PUT') return authH.updateProfile(req, res)
    }

    // ---- /api/memos ----
    if (segments[0] === 'memos') {
      if (segments.length === 1 && method === 'GET') return memoH.listMemos(req, res)
      if (segments.length === 1 && method === 'POST') return memoH.createMemo(req, res)
      if (segments.length === 2 && method === 'GET') return memoH.getMemo(req, res, segments[1])
      if (segments.length === 2 && method === 'PUT') return memoH.updateMemo(req, res, segments[1])
      if (segments.length === 2 && method === 'DELETE') return memoH.deleteMemo(req, res, segments[1])
      if (segments.length === 3 && segments[2] === 'submit' && method === 'POST') return memoH.submitMemo(req, res, segments[1])
      if (segments.length === 3 && segments[2] === 'cancel' && method === 'POST') return memoH.cancelMemo(req, res, segments[1])
    }

    // ---- /api/workflow/:memoId/:action ----
    if (segments[0] === 'workflow' && segments.length === 3 && method === 'POST') {
      const memoId = segments[1]
      const action = segments[2]
      if (action === 'approve') return workflowH.approveStep(req, res, memoId)
      if (action === 'reject') return workflowH.rejectStep(req, res, memoId)
      if (action === 'request-changes') return workflowH.requestChanges(req, res, memoId)
      if (action === 'forward') return workflowH.forwardStep(req, res, memoId)
    }

    // ---- /api/comments/:memoId ----
    if (segments[0] === 'comments' && segments.length === 2) {
      if (method === 'GET') return commentH.listComments(req, res, segments[1])
      if (method === 'POST') return commentH.addComment(req, res, segments[1])
    }

    // ---- /api/attachments ----
    if (segments[0] === 'attachments') {
      if (segments.length === 2 && segments[1] !== 'download' && method === 'POST') {
        return attachmentH.uploadAttachment(req, res, segments[1])
      }
      if (segments.length === 3 && segments[1] === 'download' && method === 'GET') {
        return attachmentH.downloadAttachment(req, res, segments[2])
      }
      if (segments.length === 2 && method === 'DELETE') {
        return attachmentH.deleteAttachment(req, res, segments[1])
      }
    }

    // ---- /api/notifications ----
    if (segments[0] === 'notifications') {
      if (segments.length === 1 && method === 'GET') return notificationH.listNotifications(req, res)
      if (segments.length === 2 && segments[1] === 'read-all' && method === 'POST') {
        return notificationH.markAllNotificationsRead(req, res)
      }
      if (segments.length === 3 && segments[2] === 'read' && method === 'POST') {
        return notificationH.markNotificationRead(req, res, segments[1])
      }
    }

    // ---- /api/search ----
    if (segments[0] === 'search' && method === 'GET') return searchH.search(req, res)

    // ---- /api/users (lightweight org directory, any authenticated user) ----
    if (segments[0] === 'users' && segments.length === 1 && method === 'GET') return adminH.listUserDirectory(req, res)

    // ---- /api/delegations ----
    if (segments[0] === 'delegations') {
      if (segments.length === 1 && method === 'GET') return delegationH.listDelegations(req, res)
      if (segments.length === 1 && method === 'POST') return delegationH.createDelegation(req, res)
      if (segments.length === 2 && method === 'DELETE') return delegationH.revokeDelegation(req, res, segments[1])
    }

    // ---- /api/dashboard (personal) ----
    if (segments[0] === 'dashboard' && method === 'GET') return adminH.userDashboard(req, res)

    // ---- /api/admin/* ----
    if (segments[0] === 'admin') {
      if (segments[1] === 'dashboard' && method === 'GET') return adminH.adminDashboard(req, res)

      if (segments[1] === 'users') {
        if (segments.length === 2 && method === 'GET') return adminH.listUsers(req, res)
        if (segments.length === 2 && method === 'POST') return adminH.createUser(req, res)
        if (segments.length === 3 && method === 'PUT') return adminH.updateUser(req, res, segments[2])
        if (segments.length === 3 && method === 'DELETE') return adminH.deactivateUser(req, res, segments[2])
      }

      if (segments[1] === 'departments') {
        if (segments.length === 2 && method === 'GET') return adminH.listDepartments(req, res)
        if (segments.length === 2 && method === 'POST') return adminH.createDepartment(req, res)
        if (segments.length === 3 && method === 'PUT') return adminH.updateDepartment(req, res, segments[2])
      }

      if (segments[1] === 'categories') {
        if (segments.length === 2 && method === 'GET') return adminH.listCategories(req, res)
        if (segments.length === 2 && method === 'POST') return adminH.createCategory(req, res)
        if (segments.length === 3 && method === 'PUT') return adminH.updateCategory(req, res, segments[2])
      }

      if (segments[1] === 'organization') {
        if (segments.length === 2 && method === 'GET') return adminH.getOrganization(req, res)
        if (segments.length === 2 && method === 'PUT') return adminH.updateOrganization(req, res)
      }

      if (segments[1] === 'audit-log' && segments.length === 2 && method === 'GET') {
        return adminH.listAuditLog(req, res)
      }

      if (segments[1] === 'workflow-templates') {
        if (segments.length === 2 && method === 'GET') return adminH.listWorkflowTemplates(req, res)
        if (segments.length === 2 && method === 'POST') return adminH.createWorkflowTemplate(req, res)
        if (segments.length === 3 && method === 'DELETE') return adminH.deleteWorkflowTemplate(req, res, segments[2])
      }
    }

    return fail(res, 404, `No route matched: ${method} /${segments.join('/')}`)
  } catch (err) {
    console.error('Router error:', err)
    return fail(res, 500, 'Internal server error')
  }
}
