import { prisma } from './prisma'

export async function logAudit(params: {
  organizationId: string
  userId?: string | null
  eventType: string
  entityType: string
  entityId?: string | null
  description: string
}) {
  await prisma.auditLog.create({
    data: {
      organizationId: params.organizationId,
      userId: params.userId ?? null,
      eventType: params.eventType,
      entityType: params.entityType,
      entityId: params.entityId ?? null,
      description: params.description,
    },
  })
}
