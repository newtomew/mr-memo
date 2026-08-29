import type { VercelRequest } from '@vercel/node'
import { prisma } from './prisma'
import { supabaseAdmin } from './auth'
import { ApiError } from './response'
import type { PlatformAdmin } from '@prisma/client'

/**
 * Resolves a Bearer token to a PlatformAdmin row. Completely separate from
 * requireAuth() — platform admins are not members of any Organization and
 * have no User row, so they need their own identity lookup.
 */
export async function requirePlatformAdmin(req: VercelRequest): Promise<PlatformAdmin> {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) throw new ApiError(401, 'Missing Authorization bearer token')

  const { data, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !data?.user) throw new ApiError(401, 'Invalid or expired session')

  const admin = await prisma.platformAdmin.findUnique({ where: { authId: data.user.id } })
  if (!admin) throw new ApiError(403, 'Platform administrator privileges required')

  return admin
}
