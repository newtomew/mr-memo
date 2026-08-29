import { prisma } from './prisma'
import type { NotificationType } from '@prisma/client'

export async function notify(params: {
  organizationId: string
  userId: string
  memoId?: string | null
  type: NotificationType
  message: string
}) {
  await prisma.notification.create({
    data: {
      organizationId: params.organizationId,
      userId: params.userId,
      memoId: params.memoId ?? null,
      type: params.type,
      message: params.message,
    },
  })
}

/** Generates the next memo number for an org, e.g. ORG-2026-001 */
export async function generateMemoNumber(organizationId: string, orgSlug: string): Promise<string> {
  const year = new Date().getFullYear()
  const prefix = orgSlug.toUpperCase().slice(0, 8)
  const count = await prisma.memo.count({
    where: {
      organizationId,
      memoNumber: { startsWith: `${prefix}-${year}-` },
    },
  })
  const seq = String(count + 1).padStart(3, '0')
  return `${prefix}-${year}-${seq}`
}
