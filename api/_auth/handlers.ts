import type { VercelRequest, VercelResponse } from '@vercel/node'
import { z } from 'zod'
import { randomUUID } from 'crypto'
import { prisma } from '../_lib/prisma'
import { supabaseAdmin, requireAuth, freshAuthClient } from '../_lib/auth'
import { ok, fail, handleError, ApiError } from '../_lib/response'
import { logAudit } from '../_lib/audit'
import { notify } from '../_lib/notify'

const AVATAR_BUCKET = 'avatars'
const MAX_AVATAR_SIZE = 3 * 1024 * 1024 // 3MB
const ALLOWED_AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
  organizationName: z.string().min(1),
})

/** POST /api/auth/register — creates a brand-new organization + its first admin user */
export async function register(req: VercelRequest, res: VercelResponse) {
  try {
    const body = registerSchema.parse(req.body)
    const slug = body.organizationName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 40) || `org-${Date.now()}`

    const existingOrg = await prisma.organization.findUnique({ where: { slug } })
    if (existingOrg) {
      return fail(res, 409, 'An organization with a similar name already exists')
    }

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: body.email,
      password: body.password,
      email_confirm: true,
    })
    if (authError || !authData?.user) {
      return fail(res, 400, authError?.message || 'Failed to create account')
    }

    const result = await prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: { name: body.organizationName, slug },
      })
      const user = await tx.user.create({
        data: {
          authId: authData.user.id,
          organizationId: org.id,
          email: body.email,
          name: body.name,
          role: 'ADMIN',
        },
      })
      return { org, user }
    })

    await logAudit({
      organizationId: result.org.id,
      userId: result.user.id,
      eventType: 'user.registered',
      entityType: 'User',
      entityId: result.user.id,
      description: `${result.user.name} registered and created organization "${result.org.name}"`,
    })

    return ok(res, { organization: result.org, user: result.user }, 201)
  } catch (err) {
    if (err instanceof z.ZodError) return fail(res, 400, err.errors[0]?.message || 'Invalid input')
    return handleError(res, err)
  }
}

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

/** POST /api/auth/login — authenticates via Supabase and returns a session */
export async function login(req: VercelRequest, res: VercelResponse) {
  try {
    const body = loginSchema.parse(req.body)

    const { data, error } = await freshAuthClient().auth.signInWithPassword({
      email: body.email,
      password: body.password,
    })
    if (error || !data.session) {
      return fail(res, 401, 'Invalid email or password')
    }

    const user = await prisma.user.findUnique({
      where: { authId: data.user.id },
      include: { organization: true, department: true },
    })
    if (!user) {
      return fail(res, 403, 'No profile found for this account')
    }
    if (user.status !== 'ACTIVE') {
      if (user.status === 'PENDING_APPROVAL') {
        return fail(res, 403, 'Your account is still awaiting approval to join this organization')
      }
      return fail(res, 403, 'This account has been deactivated')
    }
    if (user.organization.status !== 'ACTIVE') {
      return fail(res, 403, 'This organization has been suspended')
    }

    const previousLoginAt = user.lastLoginAt
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
      include: { organization: true, department: true },
    })

    await logAudit({
      organizationId: user.organizationId,
      userId: user.id,
      eventType: 'user.login',
      entityType: 'User',
      entityId: user.id,
      description: `${user.name} logged in`,
    })

    return ok(res, {
      session: {
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
        expiresAt: data.session.expires_at,
      },
      user: updatedUser,
      previousLoginAt,
    })
  } catch (err) {
    if (err instanceof z.ZodError) return fail(res, 400, err.errors[0]?.message || 'Invalid input')
    return handleError(res, err)
  }
}

/** POST /api/auth/logout — records the logout event. Session invalidation itself
 * happens client-side (the JWT is simply discarded); Supabase JWTs are stateless. */
export async function logout(req: VercelRequest, res: VercelResponse) {
  try {
    const ctx = await requireAuth(req)
    await logAudit({
      organizationId: ctx.organizationId,
      userId: ctx.user.id,
      eventType: 'user.logout',
      entityType: 'User',
      entityId: ctx.user.id,
      description: `${ctx.user.name} logged out`,
    })
    return ok(res, { message: 'Logged out' })
  } catch (err) {
    return handleError(res, err)
  }
}

/** POST /api/auth/me — returns the current authenticated user profile */
export async function me(req: VercelRequest, res: VercelResponse) {
  try {
    const ctx = await requireAuth(req)
    const user = await prisma.user.findUnique({
      where: { id: ctx.user.id },
      include: { organization: true, department: true },
    })
    return ok(res, { user })
  } catch (err) {
    return handleError(res, err)
  }
}

const changePasswordSchema = z.object({
  newPassword: z.string().min(8),
})

/** POST /api/auth/change-password */
export async function changePassword(req: VercelRequest, res: VercelResponse) {
  try {
    const ctx = await requireAuth(req)
    const body = changePasswordSchema.parse(req.body)

    const { error } = await supabaseAdmin.auth.admin.updateUserById(ctx.authId, {
      password: body.newPassword,
    })
    if (error) throw new ApiError(400, error.message)

    await logAudit({
      organizationId: ctx.organizationId,
      userId: ctx.user.id,
      eventType: 'user.password_changed',
      entityType: 'User',
      entityId: ctx.user.id,
      description: `${ctx.user.name} changed their password`,
    })

    return ok(res, { message: 'Password updated' })
  } catch (err) {
    if (err instanceof z.ZodError) return fail(res, 400, err.errors[0]?.message || 'Invalid input')
    return handleError(res, err)
  }
}

/** GET /api/auth/organizations?q=... — public search used by the "join an
 * existing organization" signup flow. Only ACTIVE (non-banned) orgs are listed. */
export async function searchOrganizations(req: VercelRequest, res: VercelResponse) {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : ''
    const organizations = await prisma.organization.findMany({
      where: {
        status: 'ACTIVE',
        ...(q ? { name: { contains: q, mode: 'insensitive' } } : {}),
      },
      select: { id: true, name: true, slug: true },
      orderBy: { name: 'asc' },
      take: 20,
    })
    return ok(res, { organizations })
  } catch (err) {
    return handleError(res, err)
  }
}

const joinOrganizationSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
  organizationId: z.string().min(1),
  requestedRole: z.enum(['MANAGER', 'USER']),
})

/**
 * POST /api/auth/join — request to join an EXISTING organization as Manager
 * or Employee. The account is created immediately but held in
 * PENDING_APPROVAL status (requireAuth rejects non-ACTIVE users, so it
 * cannot log in yet). An Employee (USER) request is reviewed by that org's
 * Admins/Managers; a Manager request is reviewed by a platform administrator
 * — see /api/platform/join-requests.
 */
export async function joinOrganization(req: VercelRequest, res: VercelResponse) {
  try {
    const body = joinOrganizationSchema.parse(req.body)

    const org = await prisma.organization.findUnique({ where: { id: body.organizationId } })
    if (!org || org.status !== 'ACTIVE') {
      return fail(res, 404, 'Organization not found')
    }

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: body.email,
      password: body.password,
      email_confirm: true,
    })
    if (authError || !authData?.user) {
      return fail(res, 400, authError?.message || 'Failed to create account')
    }

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          authId: authData.user.id,
          organizationId: org.id,
          email: body.email,
          name: body.name,
          role: body.requestedRole,
          status: 'PENDING_APPROVAL',
        },
      })
      const joinRequest = await tx.joinRequest.create({
        data: {
          organizationId: org.id,
          userId: user.id,
          requestedRole: body.requestedRole,
        },
      })
      return { user, joinRequest }
    })

    await logAudit({
      organizationId: org.id,
      userId: result.user.id,
      eventType: 'user.join_requested',
      entityType: 'JoinRequest',
      entityId: result.joinRequest.id,
      description: `${result.user.name} requested to join as ${body.requestedRole === 'MANAGER' ? 'Manager' : 'Employee'}`,
    })

    if (body.requestedRole === 'USER') {
      const reviewers = await prisma.user.findMany({
        where: { organizationId: org.id, status: 'ACTIVE', role: { in: ['ADMIN', 'MANAGER'] } },
        select: { id: true },
      })
      await Promise.all(
        reviewers.map((r) =>
          notify({
            organizationId: org.id,
            userId: r.id,
            type: 'JOIN_REQUEST_SUBMITTED',
            message: `${result.user.name} requested to join ${org.name} as an Employee`,
          })
        )
      )
    }

    return ok(
      res,
      {
        message:
          body.requestedRole === 'MANAGER'
            ? 'Request submitted. A platform administrator will review your request to join as Manager.'
            : 'Request submitted. An organization admin or manager will review your request.',
      },
      201
    )
  } catch (err) {
    if (err instanceof z.ZodError) return fail(res, 400, err.errors[0]?.message || 'Invalid input')
    return handleError(res, err)
  }
}

const updateProfileSchema = z.object({
  name: z.string().min(1).optional(),
  designation: z.string().optional(),
})

/** PUT /api/auth/profile — self-service edit of the caller's own name/designation */
export async function updateProfile(req: VercelRequest, res: VercelResponse) {
  try {
    const ctx = await requireAuth(req)
    const body = updateProfileSchema.parse(req.body)

    const user = await prisma.user.update({
      where: { id: ctx.user.id },
      data: body,
      include: { organization: true, department: true },
    })

    await logAudit({
      organizationId: ctx.organizationId,
      userId: ctx.user.id,
      eventType: 'user.profile_updated',
      entityType: 'User',
      entityId: ctx.user.id,
      description: `${user.name} updated their own profile`,
    })

    return ok(res, { user })
  } catch (err) {
    if (err instanceof z.ZodError) return fail(res, 400, err.errors[0]?.message || 'Invalid input')
    return handleError(res, err)
  }
}

const uploadAvatarSchema = z.object({
  mimeType: z.string().min(1),
  base64Data: z.string().min(1),
})

/** POST /api/auth/avatar — upload/replace the caller's profile picture */
export async function uploadAvatar(req: VercelRequest, res: VercelResponse) {
  try {
    const ctx = await requireAuth(req)
    const body = uploadAvatarSchema.parse(req.body)

    if (!ALLOWED_AVATAR_TYPES.includes(body.mimeType)) {
      throw new ApiError(400, 'Only JPEG, PNG, WebP or GIF images are allowed')
    }
    const buffer = Buffer.from(body.base64Data, 'base64')
    if (buffer.byteLength > MAX_AVATAR_SIZE) throw new ApiError(400, 'Image exceeds the 3MB limit')

    const ext = body.mimeType.split('/')[1] || 'png'
    const storageKey = `${ctx.organizationId}/${ctx.user.id}/${randomUUID()}.${ext}`
    const { error: uploadError } = await supabaseAdmin.storage.from(AVATAR_BUCKET).upload(storageKey, buffer, {
      contentType: body.mimeType,
      upsert: false,
    })
    if (uploadError) throw new ApiError(500, `Upload failed: ${uploadError.message}`)

    const previousKey = ctx.user.avatarUrl
    const { data: publicUrlData } = supabaseAdmin.storage.from(AVATAR_BUCKET).getPublicUrl(storageKey)

    const user = await prisma.user.update({
      where: { id: ctx.user.id },
      data: { avatarUrl: publicUrlData.publicUrl },
      include: { organization: true, department: true },
    })

    if (previousKey) {
      const prevKey = previousKey.split(`/${AVATAR_BUCKET}/`)[1]
      if (prevKey) await supabaseAdmin.storage.from(AVATAR_BUCKET).remove([prevKey])
    }

    return ok(res, { user })
  } catch (err) {
    if (err instanceof z.ZodError) return fail(res, 400, err.errors[0]?.message || 'Invalid input')
    return handleError(res, err)
  }
}

const changeEmailSchema = z.object({
  newEmail: z.string().email(),
})

/** PUT /api/auth/email — change the caller's login email */
export async function changeEmail(req: VercelRequest, res: VercelResponse) {
  try {
    const ctx = await requireAuth(req)
    const body = changeEmailSchema.parse(req.body)

    const clash = await prisma.user.findFirst({ where: { email: body.newEmail, id: { not: ctx.user.id } } })
    if (clash) throw new ApiError(409, 'That email is already in use')

    const { error } = await supabaseAdmin.auth.admin.updateUserById(ctx.authId, { email: body.newEmail })
    if (error) throw new ApiError(400, error.message)

    const user = await prisma.user.update({
      where: { id: ctx.user.id },
      data: { email: body.newEmail },
      include: { organization: true, department: true },
    })

    await logAudit({
      organizationId: ctx.organizationId,
      userId: ctx.user.id,
      eventType: 'user.email_changed',
      entityType: 'User',
      entityId: ctx.user.id,
      description: `${user.name} changed their login email`,
    })

    return ok(res, { user })
  } catch (err) {
    if (err instanceof z.ZodError) return fail(res, 400, err.errors[0]?.message || 'Invalid input')
    return handleError(res, err)
  }
}
