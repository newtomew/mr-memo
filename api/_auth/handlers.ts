import type { VercelRequest, VercelResponse } from '@vercel/node'
import { z } from 'zod'
import { prisma } from '../_lib/prisma'
import { supabaseAdmin, requireAuth } from '../_lib/auth'
import { ok, fail, handleError, ApiError } from '../_lib/response'
import { logAudit } from '../_lib/audit'

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

    const { data, error } = await supabaseAdmin.auth.signInWithPassword({
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
      return fail(res, 403, 'This account has been deactivated')
    }

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
      user,
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
