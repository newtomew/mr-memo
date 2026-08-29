import type { VercelRequest, VercelResponse } from '@vercel/node'
import { z } from 'zod'
import { prisma } from '../_lib/prisma'
import { requireAuth } from '../_lib/auth'
import { ok, fail, handleError, ApiError } from '../_lib/response'
import { logAudit } from '../_lib/audit'
import { notify } from '../_lib/notify'

/**
 * Org-level review queue for people requesting to join THIS organization as
 * an Employee (requestedRole 'USER'). Manager-role requests are platform-wide
 * and reviewed only via /api/platform/join-requests — an org Admin/Manager
 * has no authority over who else joins as a fellow Manager.
 */
function requireReviewer(ctx: { user: { role: string } }) {
  if (ctx.user.role !== 'ADMIN' && ctx.user.role !== 'MANAGER') {
    throw new ApiError(403, 'Only organization admins or managers can review join requests')
  }
}

/** GET /api/join-requests — pending Employee join requests for the caller's org */
export async function listJoinRequests(req: VercelRequest, res: VercelResponse) {
  try {
    const ctx = await requireAuth(req)
    requireReviewer(ctx)

    const requests = await prisma.joinRequest.findMany({
      where: { organizationId: ctx.organizationId, requestedRole: 'USER', status: 'PENDING' },
      include: { user: { select: { id: true, name: true, email: true, createdAt: true } } },
      orderBy: { createdAt: 'asc' },
    })
    return ok(res, { requests })
  } catch (err) {
    return handleError(res, err)
  }
}

const decisionSchema = z.object({
  rejectionReason: z.string().optional(),
})

/** POST /api/join-requests/:id/approve */
export async function approveJoinRequest(req: VercelRequest, res: VercelResponse, id: string) {
  try {
    const ctx = await requireAuth(req)
    requireReviewer(ctx)

    const joinRequest = await prisma.joinRequest.findUnique({ where: { id }, include: { user: true } })
    if (!joinRequest || joinRequest.organizationId !== ctx.organizationId) {
      return fail(res, 404, 'Join request not found')
    }
    if (joinRequest.requestedRole !== 'USER') {
      return fail(res, 403, 'Manager join requests can only be approved by a platform administrator')
    }
    if (joinRequest.status !== 'PENDING') {
      return fail(res, 409, 'This request has already been reviewed')
    }

    await prisma.$transaction([
      prisma.joinRequest.update({
        where: { id },
        data: { status: 'APPROVED', reviewedByUserId: ctx.user.id, reviewedAt: new Date() },
      }),
      prisma.user.update({ where: { id: joinRequest.userId }, data: { status: 'ACTIVE' } }),
    ])

    await notify({
      organizationId: ctx.organizationId,
      userId: joinRequest.userId,
      type: 'JOIN_REQUEST_APPROVED',
      message: `Your request to join as an Employee was approved. You can now log in.`,
    })

    await logAudit({
      organizationId: ctx.organizationId,
      userId: ctx.user.id,
      eventType: 'join_request.approved',
      entityType: 'JoinRequest',
      entityId: id,
      description: `${ctx.user.name} approved ${joinRequest.user.name}'s request to join as an Employee`,
    })

    return ok(res, { message: 'Join request approved' })
  } catch (err) {
    if (err instanceof z.ZodError) return fail(res, 400, err.errors[0]?.message || 'Invalid input')
    return handleError(res, err)
  }
}

/** POST /api/join-requests/:id/reject */
export async function rejectJoinRequest(req: VercelRequest, res: VercelResponse, id: string) {
  try {
    const ctx = await requireAuth(req)
    requireReviewer(ctx)
    const body = decisionSchema.parse(req.body)

    const joinRequest = await prisma.joinRequest.findUnique({ where: { id }, include: { user: true } })
    if (!joinRequest || joinRequest.organizationId !== ctx.organizationId) {
      return fail(res, 404, 'Join request not found')
    }
    if (joinRequest.requestedRole !== 'USER') {
      return fail(res, 403, 'Manager join requests can only be reviewed by a platform administrator')
    }
    if (joinRequest.status !== 'PENDING') {
      return fail(res, 409, 'This request has already been reviewed')
    }

    await prisma.$transaction([
      prisma.joinRequest.update({
        where: { id },
        data: {
          status: 'REJECTED',
          reviewedByUserId: ctx.user.id,
          reviewedAt: new Date(),
          rejectionReason: body.rejectionReason,
        },
      }),
      prisma.user.update({ where: { id: joinRequest.userId }, data: { status: 'INACTIVE' } }),
    ])

    await logAudit({
      organizationId: ctx.organizationId,
      userId: ctx.user.id,
      eventType: 'join_request.rejected',
      entityType: 'JoinRequest',
      entityId: id,
      description: `${ctx.user.name} rejected ${joinRequest.user.name}'s request to join as an Employee`,
    })

    return ok(res, { message: 'Join request rejected' })
  } catch (err) {
    if (err instanceof z.ZodError) return fail(res, 400, err.errors[0]?.message || 'Invalid input')
    return handleError(res, err)
  }
}
