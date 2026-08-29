import type { VercelRequest, VercelResponse } from '@vercel/node'
import { z } from 'zod'
import { prisma } from '../_lib/prisma'
import { requireAuth } from '../_lib/auth'
import { ok, fail, handleError, ApiError } from '../_lib/response'
import { logAudit } from '../_lib/audit'

const createSchema = z.object({
  delegateId: z.string().uuid(),
  startDate: z.string(),
  endDate: z.string(),
  reason: z.string().optional(),
})

/** POST /api/delegations — designate another user to act on my behalf for a date range */
export async function createDelegation(req: VercelRequest, res: VercelResponse) {
  try {
    const ctx = await requireAuth(req)
    const body = createSchema.parse(req.body)

    if (body.delegateId === ctx.user.id) throw new ApiError(400, 'You cannot delegate to yourself')
    const delegate = await prisma.user.findFirst({
      where: { id: body.delegateId, organizationId: ctx.organizationId, status: 'ACTIVE' },
    })
    if (!delegate) throw new ApiError(400, 'Delegate not found')

    const startDate = new Date(body.startDate)
    const endDate = new Date(body.endDate)
    if (endDate < startDate) throw new ApiError(400, 'End date must be after start date')

    const delegation = await prisma.delegation.create({
      data: {
        organizationId: ctx.organizationId,
        delegatingUserId: ctx.user.id,
        delegateId: body.delegateId,
        startDate,
        endDate,
        reason: body.reason,
      },
      include: { delegate: { select: { id: true, name: true, email: true } } },
    })

    await logAudit({
      organizationId: ctx.organizationId,
      userId: ctx.user.id,
      eventType: 'delegation.created',
      entityType: 'Delegation',
      entityId: delegation.id,
      description: `${ctx.user.name} delegated approval authority to ${delegate.name} (${body.startDate} – ${body.endDate})`,
    })

    return ok(res, { delegation }, 201)
  } catch (err) {
    if (err instanceof z.ZodError) return fail(res, 400, err.errors[0]?.message || 'Invalid input')
    return handleError(res, err)
  }
}

/** GET /api/delegations — delegations I've given and received */
export async function listDelegations(req: VercelRequest, res: VercelResponse) {
  try {
    const ctx = await requireAuth(req)
    const [given, received] = await Promise.all([
      prisma.delegation.findMany({
        where: { organizationId: ctx.organizationId, delegatingUserId: ctx.user.id },
        orderBy: { startDate: 'desc' },
        include: { delegate: { select: { id: true, name: true, email: true } } },
      }),
      prisma.delegation.findMany({
        where: { organizationId: ctx.organizationId, delegateId: ctx.user.id },
        orderBy: { startDate: 'desc' },
        include: { delegatingUser: { select: { id: true, name: true, email: true } } },
      }),
    ])
    return ok(res, { given, received })
  } catch (err) {
    return handleError(res, err)
  }
}

/** DELETE /api/delegations/:id — revoke a delegation I created */
export async function revokeDelegation(req: VercelRequest, res: VercelResponse, id: string) {
  try {
    const ctx = await requireAuth(req)
    const delegation = await prisma.delegation.findFirst({
      where: { id, organizationId: ctx.organizationId, delegatingUserId: ctx.user.id },
    })
    if (!delegation) throw new ApiError(404, 'Delegation not found')
    await prisma.delegation.update({ where: { id }, data: { active: false } })
    return ok(res, { message: 'Delegation revoked' })
  } catch (err) {
    return handleError(res, err)
  }
}
