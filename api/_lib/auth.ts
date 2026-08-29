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

/**
 * A fresh, throwaway client for password sign-in. `signInWithPassword`
 * establishes a session ON THE CLIENT INSTANCE THAT CALLS IT, which would
 * silently hijack `supabaseAdmin`'s Authorization header away from the
 * service-role key and onto whichever end user last logged in — breaking
 * every subsequent service-role call (Storage uploads included) for the
 * rest of the process's life. Never call signInWithPassword on the shared
 * supabaseAdmin client; use this instead.
 */
export function freshAuthClient() {
  return createClient(process.env.SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '', {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

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
    include: { organization: { select: { status: true } } },
  })

  if (!user) {
    throw new ApiError(403, 'No user profile found for this account')
  }

  if (user.status !== 'ACTIVE') {
    throw new ApiError(403, 'This account has been deactivated')
  }

  if (user.organization.status !== 'ACTIVE') {
    throw new ApiError(403, 'This organization has been suspended')
  }

  return { user, authId: data.user.id, organizationId: user.organizationId }
}

export function requireAdmin(ctx: AuthContext) {
  if (ctx.user.role !== 'ADMIN') {
    throw new ApiError(403, 'Administrator privileges required')
  }
}
