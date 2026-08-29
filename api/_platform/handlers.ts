import type { VercelRequest, VercelResponse } from '@vercel/node'
import { z } from 'zod'
import { prisma } from '../_lib/prisma'
import { freshAuthClient } from '../_lib/auth'
import { requirePlatformAdmin } from '../_lib/platformAuth'
import { ok, fail, handleError } from '../_lib/response'
import { notify } from '../_lib/notify'

/** GET /api/platform/organizations — every org that has ever signed up, with headcounts */
export async function listOrganizations(req: VercelRequest, res: VercelResponse) {
  try {
    await requirePlatformAdmin(req)
    const organizations = await prisma.organization.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { users: true, memos: true } } },
    })
    return ok(res, { organizations })
  } catch (err) {
    return handleError(res, err)
  }
}

/** GET /api/platform/organizations/:id — full detail: managers, employees, memos, activity */
export async function getOrganization(req: VercelRequest, res: VercelResponse, id: string) {
  try {
    await requirePlatformAdmin(req)
    const organization = await prisma.organization.findUnique({ where: { id } })
    if (!organization) return fail(res, 404, 'Organization not found')

    const [admins, managers, employees, memos, auditLog] = await Promise.all([
      prisma.user.findMany({ where: { organizationId: id, role: 'ADMIN' }, orderBy: { createdAt: 'asc' } }),
      prisma.user.findMany({ where: { organizationId: id, role: 'MANAGER' }, orderBy: { createdAt: 'asc' } }),
      prisma.user.findMany({ where: { organizationId: id, role: 'USER' }, orderBy: { createdAt: 'asc' } }),
      prisma.memo.findMany({
        where: { organizationId: id },
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: { author: { select: { id: true, name: true } } },
      }),
      prisma.auditLog.findMany({ where: { organizationId: id }, orderBy: { createdAt: 'desc' }, take: 200 }),
    ])

    return ok(res, { organization, admins, managers, employees, memos, auditLog })
  } catch (err) {
    return handleError(res, err)
  }
}

const banSchema = z.object({ banned: z.boolean() })

/** PUT /api/platform/organizations/:id/ban — block/unblock an entire organization */
export async function setOrganizationBanned(req: VercelRequest, res: VercelResponse, id: string) {
  try {
    const admin = await requirePlatformAdmin(req)
    const body = banSchema.parse(req.body)
    const organization = await prisma.organization.update({
      where: { id },
      data: { status: body.banned ? 'INACTIVE' : 'ACTIVE' },
    })
    console.log(`[platform] ${admin.email} ${body.banned ? 'banned' : 'unbanned'} organization ${organization.slug}`)
    return ok(res, { organization })
  } catch (err) {
    if (err instanceof z.ZodError) return fail(res, 400, err.errors[0]?.message || 'Invalid input')
    return handleError(res, err)
  }
}

/** PUT /api/platform/users/:id/ban — block/unblock a single Manager or Employee */
export async function setUserBanned(req: VercelRequest, res: VercelResponse, id: string) {
  try {
    const admin = await requirePlatformAdmin(req)
    const body = banSchema.parse(req.body)
    const user = await prisma.user.update({
      where: { id },
      data: { status: body.banned ? 'INACTIVE' : 'ACTIVE' },
    })
    console.log(`[platform] ${admin.email} ${body.banned ? 'banned' : 'unbanned'} user ${user.email}`)
    return ok(res, { user })
  } catch (err) {
    if (err instanceof z.ZodError) return fail(res, 400, err.errors[0]?.message || 'Invalid input')
    return handleError(res, err)
  }
}

const blockMemoSchema = z.object({ blocked: z.boolean() })

/** PUT /api/platform/memos/:id/block — block/unblock a single memo request platform-wide */
export async function setMemoBlocked(req: VercelRequest, res: VercelResponse, id: string) {
  try {
    await requirePlatformAdmin(req)
    const body = blockMemoSchema.parse(req.body)
    const existing = await prisma.memo.findUnique({ where: { id } })
    if (!existing) return fail(res, 404, 'Memo not found')

    if (!body.blocked && existing.status !== 'BLOCKED') {
      return ok(res, { memo: existing })
    }
    const memo = await prisma.memo.update({
      where: { id },
      // Unblocking restores it to the pending-review pool rather than DRAFT,
      // since a blocked memo was already visible/submitted before a platform
      // admin intervened — DRAFT would hide it from its approvers again.
      data: { status: body.blocked ? 'BLOCKED' : 'PENDING_REVIEW' },
    })
    return ok(res, { memo })
  } catch (err) {
    if (err instanceof z.ZodError) return fail(res, 400, err.errors[0]?.message || 'Invalid input')
    return handleError(res, err)
  }
}

/** GET /api/platform/join-requests — pending Manager-role join requests, platform-wide */
export async function listPlatformJoinRequests(req: VercelRequest, res: VercelResponse) {
  try {
    await requirePlatformAdmin(req)
    const requests = await prisma.joinRequest.findMany({
      where: { requestedRole: 'MANAGER', status: 'PENDING' },
      include: {
        user: { select: { id: true, name: true, email: true, createdAt: true } },
        organization: { select: { id: true, name: true, slug: true } },
      },
      orderBy: { createdAt: 'asc' },
    })
    return ok(res, { requests })
  } catch (err) {
    return handleError(res, err)
  }
}

/** POST /api/platform/join-requests/:id/approve */
export async function approvePlatformJoinRequest(req: VercelRequest, res: VercelResponse, id: string) {
  try {
    const admin = await requirePlatformAdmin(req)
    const joinRequest = await prisma.joinRequest.findUnique({ where: { id }, include: { user: true } })
    if (!joinRequest) return fail(res, 404, 'Join request not found')
    if (joinRequest.requestedRole !== 'MANAGER') return fail(res, 400, 'This request is not a Manager request')
    if (joinRequest.status !== 'PENDING') return fail(res, 409, 'This request has already been reviewed')

    await prisma.$transaction([
      prisma.joinRequest.update({
        where: { id },
        data: { status: 'APPROVED', reviewedByPlatformAdminId: admin.id, reviewedAt: new Date() },
      }),
      prisma.user.update({ where: { id: joinRequest.userId }, data: { status: 'ACTIVE' } }),
    ])

    await notify({
      organizationId: joinRequest.organizationId,
      userId: joinRequest.userId,
      type: 'JOIN_REQUEST_APPROVED',
      message: 'Your request to join as a Manager was approved. You can now log in.',
    })

    return ok(res, { message: 'Join request approved' })
  } catch (err) {
    return handleError(res, err)
  }
}

const platformDecisionSchema = z.object({ rejectionReason: z.string().optional() })

/** POST /api/platform/join-requests/:id/reject */
export async function rejectPlatformJoinRequest(req: VercelRequest, res: VercelResponse, id: string) {
  try {
    const admin = await requirePlatformAdmin(req)
    const body = platformDecisionSchema.parse(req.body)
    const joinRequest = await prisma.joinRequest.findUnique({ where: { id } })
    if (!joinRequest) return fail(res, 404, 'Join request not found')
    if (joinRequest.requestedRole !== 'MANAGER') return fail(res, 400, 'This request is not a Manager request')
    if (joinRequest.status !== 'PENDING') return fail(res, 409, 'This request has already been reviewed')

    await prisma.$transaction([
      prisma.joinRequest.update({
        where: { id },
        data: {
          status: 'REJECTED',
          reviewedByPlatformAdminId: admin.id,
          reviewedAt: new Date(),
          rejectionReason: body.rejectionReason,
        },
      }),
      prisma.user.update({ where: { id: joinRequest.userId }, data: { status: 'INACTIVE' } }),
    ])

    return ok(res, { message: 'Join request rejected' })
  } catch (err) {
    if (err instanceof z.ZodError) return fail(res, 400, err.errors[0]?.message || 'Invalid input')
    return handleError(res, err)
  }
}

const platformLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

/** POST /api/platform/login — separate auth path for the 3 platform-admin accounts */
export async function platformLogin(req: VercelRequest, res: VercelResponse) {
  try {
    const body = platformLoginSchema.parse(req.body)
    const { data, error } = await freshAuthClient().auth.signInWithPassword({
      email: body.email,
      password: body.password,
    })
    if (error || !data.session) return fail(res, 401, 'Invalid email or password')

    const admin = await prisma.platformAdmin.findUnique({ where: { authId: data.user.id } })
    if (!admin) return fail(res, 403, 'This account does not have platform administrator privileges')

    return ok(res, {
      session: {
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
        expiresAt: data.session.expires_at,
      },
      admin,
    })
  } catch (err) {
    if (err instanceof z.ZodError) return fail(res, 400, err.errors[0]?.message || 'Invalid input')
    return handleError(res, err)
  }
}

/** GET /api/platform/me */
export async function platformMe(req: VercelRequest, res: VercelResponse) {
  try {
    const admin = await requirePlatformAdmin(req)
    return ok(res, { admin })
  } catch (err) {
    return handleError(res, err)
  }
}
