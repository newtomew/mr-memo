import type { VercelRequest } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { prisma } from './prisma'
import { ApiError } from './response'
import type { User } from '@prisma/client'

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export { supabaseAdmin }

export interface AuthContext {
  user: User
  authId: string
  organizationId: string
}

/**
 * Verifies the Bearer token against Supabase Auth, then resolves the
 * corresponding User row (which carries organizationId). This is the
 * single point where tenant isolation begins: every downstream query
 * must filter by ctx.organizationId.
 */
export async function requireAuth(req: VercelRequest): Promise<AuthContext> {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null

  if (!token) {
    throw new ApiError(401, 'Missing Authorization bearer token')
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !data?.user) {
    throw new ApiError(401, 'Invalid or expired session')
  }

  const user = await prisma.user.findUnique({
    where: { authId: data.user.id },
  })

  if (!user) {
    throw new ApiError(403, 'No user profile found for this account')
  }

  if (user.status !== 'ACTIVE') {
    throw new ApiError(403, 'This account has been deactivated')
  }

  return { user, authId: data.user.id, organizationId: user.organizationId }
}

export function requireAdmin(ctx: AuthContext) {
  if (ctx.user.role !== 'ADMIN') {
    throw new ApiError(403, 'Administrator privileges required')
  }
}
