import type { VercelRequest, VercelResponse } from '@vercel/node'
import { prisma } from '../_lib/prisma'
import { requireAuth } from '../_lib/auth'
import { ok, handleError, ApiError } from '../_lib/response'

/** GET /api/notifications */
export async function listNotifications(req: VercelRequest, res: VercelResponse) {
  try {
    const ctx = await requireAuth(req)
    const { unreadOnly, limit = '30', offset = '0' } = req.query as Record<string, string>

    const where: any = { organizationId: ctx.organizationId, userId: ctx.user.id }
    if (unreadOnly === 'true') where.read = false

    const [notifications, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: Math.min(Number(limit) || 30, 100),
        skip: Number(offset) || 0,
        include: { memo: { select: { id: true, subject: true, memoNumber: true } } },
      }),
      prisma.notification.count({ where: { organizationId: ctx.organizationId, userId: ctx.user.id, read: false } }),
    ])

    return ok(res, { notifications, unreadCount })
  } catch (err) {
    return handleError(res, err)
  }
}

/** POST /api/notifications/:id/read */
export async function markNotificationRead(req: VercelRequest, res: VercelResponse, notificationId: string) {
  try {
    const ctx = await requireAuth(req)
    const notification = await prisma.notification.findFirst({
      where: { id: notificationId, userId: ctx.user.id, organizationId: ctx.organizationId },
    })
    if (!notification) throw new ApiError(404, 'Notification not found')

    const updated = await prisma.notification.update({ where: { id: notificationId }, data: { read: true } })
    return ok(res, { notification: updated })
  } catch (err) {
    return handleError(res, err)
  }
}

/** POST /api/notifications/read-all */
export async function markAllNotificationsRead(req: VercelRequest, res: VercelResponse) {
  try {
    const ctx = await requireAuth(req)
    await prisma.notification.updateMany({
      where: { userId: ctx.user.id, organizationId: ctx.organizationId, read: false },
      data: { read: true },
    })
    return ok(res, { message: 'All notifications marked read' })
  } catch (err) {
    return handleError(res, err)
  }
}
