import type { VercelRequest, VercelResponse } from '@vercel/node'
import { z } from 'zod'
import { prisma } from '../_lib/prisma'
import { requireAuth } from '../_lib/auth'
import { ok, fail, handleError, ApiError } from '../_lib/response'
import { logAudit } from '../_lib/audit'
import { notify, generateMemoNumber } from '../_lib/notify'

const MEMO_INCLUDE = {
  author: { select: { id: true, name: true, email: true } },
  department: true,
  category: true,
  workflowSteps: {
    orderBy: { position: 'asc' as const },
    include: {
      approver: { select: { id: true, name: true, email: true } },
      delegatedTo: { select: { id: true, name: true, email: true } },
      approvals: { orderBy: { decidedAt: 'asc' as const }, include: { decidedBy: { select: { id: true, name: true } } } },
    },
  },
  comments: {
    orderBy: { createdAt: 'asc' as const },
    include: { author: { select: { id: true, name: true, email: true } } },
  },
  attachments: {
    include: { uploadedBy: { select: { id: true, name: true } } },
  },
  versions: { orderBy: { versionNumber: 'desc' as const } },
}

/** GET /api/memos — list memos scoped to the org, with filters */
export async function listMemos(req: VercelRequest, res: VercelResponse) {
  try {
    const ctx = await requireAuth(req)
    const { status, priority, departmentId, categoryId, scope, q, limit = '50', offset = '0' } = req.query as Record<string, string>

    const where: any = { organizationId: ctx.organizationId }
    if (status) where.status = status
    if (priority) where.priority = priority
    if (departmentId) where.departmentId = departmentId
    if (categoryId) where.categoryId = categoryId
    if (q) {
      where.OR = [
        { subject: { contains: q, mode: 'insensitive' } },
        { body: { contains: q, mode: 'insensitive' } },
        { memoNumber: { contains: q, mode: 'insensitive' } },
      ]
    }

    if (scope === 'mine') {
      where.authorId = ctx.user.id
    } else if (scope === 'inbox') {
      where.workflowSteps = {
        some: { approverId: ctx.user.id, status: 'PENDING' },
      }
      where.status = { in: ['SUBMITTED', 'PENDING_REVIEW', 'PENDING_APPROVAL'] }
    }

    const [memos, total] = await Promise.all([
      prisma.memo.findMany({
        where,
        include: MEMO_INCLUDE,
        orderBy: { updatedAt: 'desc' },
        take: Math.min(Number(limit) || 50, 100),
        skip: Number(offset) || 0,
      }),
      prisma.memo.count({ where }),
    ])

    return ok(res, { memos, total })
  } catch (err) {
    return handleError(res, err)
  }
}

const createMemoSchema = z.object({
  subject: z.string().min(1),
  body: z.string().min(1),
  departmentId: z.string().uuid().optional().nullable(),
  categoryId: z.string().uuid().optional().nullable(),
  priority: z.enum(['NORMAL', 'HIGH', 'URGENT']).optional(),
})

/** POST /api/memos — create a draft memo */
export async function createMemo(req: VercelRequest, res: VercelResponse) {
  try {
    const ctx = await requireAuth(req)
    const body = createMemoSchema.parse(req.body)

    const memo = await prisma.memo.create({
      data: {
        organizationId: ctx.organizationId,
        authorId: ctx.user.id,
        memoNumber: `DRAFT-${Date.now()}`,
        subject: body.subject,
        body: body.body,
        departmentId: body.departmentId || null,
        categoryId: body.categoryId || null,
        priority: body.priority || 'NORMAL',
        status: 'DRAFT',
      },
      include: MEMO_INCLUDE,
    })

    await logAudit({
      organizationId: ctx.organizationId,
      userId: ctx.user.id,
      eventType: 'memo.created',
      entityType: 'Memo',
      entityId: memo.id,
      description: `${ctx.user.name} created draft memo "${memo.subject}"`,
    })

    return ok(res, { memo }, 201)
  } catch (err) {
    if (err instanceof z.ZodError) return fail(res, 400, err.errors[0]?.message || 'Invalid input')
    return handleError(res, err)
  }
}

async function assertMemoAccess(memoId: string, organizationId: string) {
  const memo = await prisma.memo.findFirst({ where: { id: memoId, organizationId } })
  if (!memo) throw new ApiError(404, 'Memo not found')
  return memo
}

/** GET /api/memos/:id */
export async function getMemo(req: VercelRequest, res: VercelResponse, memoId: string) {
  try {
    const ctx = await requireAuth(req)
    await assertMemoAccess(memoId, ctx.organizationId)
    const memo = await prisma.memo.findUnique({ where: { id: memoId }, include: MEMO_INCLUDE })
    return ok(res, { memo })
  } catch (err) {
    return handleError(res, err)
  }
}

const updateMemoSchema = z.object({
  subject: z.string().min(1).optional(),
  body: z.string().min(1).optional(),
  departmentId: z.string().uuid().optional().nullable(),
  categoryId: z.string().uuid().optional().nullable(),
  priority: z.enum(['NORMAL', 'HIGH', 'URGENT']).optional(),
})

/** PUT /api/memos/:id — only the author, and only while draft or changes-requested */
export async function updateMemo(req: VercelRequest, res: VercelResponse, memoId: string) {
  try {
    const ctx = await requireAuth(req)
    const existing = await assertMemoAccess(memoId, ctx.organizationId)

    if (existing.authorId !== ctx.user.id) {
      throw new ApiError(403, 'Only the author can edit this memo')
    }
    if (!['DRAFT', 'CHANGES_REQUESTED'].includes(existing.status)) {
      throw new ApiError(400, 'Memo can only be edited while draft or changes-requested')
    }

    const body = updateMemoSchema.parse(req.body)

    // Preserve history when editing a memo that was returned for changes.
    if (existing.status === 'CHANGES_REQUESTED') {
      const lastVersion = await prisma.memoVersion.findFirst({
        where: { memoId },
        orderBy: { versionNumber: 'desc' },
      })
      await prisma.memoVersion.create({
        data: {
          organizationId: ctx.organizationId,
          memoId,
          createdById: ctx.user.id,
          versionNumber: (lastVersion?.versionNumber || 0) + 1,
          subject: existing.subject,
          body: existing.body,
        },
      })
    }

    const memo = await prisma.memo.update({
      where: { id: memoId },
      data: {
        subject: body.subject,
        body: body.body,
        departmentId: body.departmentId,
        categoryId: body.categoryId,
        priority: body.priority,
      },
      include: MEMO_INCLUDE,
    })

    await logAudit({
      organizationId: ctx.organizationId,
      userId: ctx.user.id,
      eventType: 'memo.updated',
      entityType: 'Memo',
      entityId: memo.id,
      description: `${ctx.user.name} updated memo "${memo.subject}"`,
    })

    return ok(res, { memo })
  } catch (err) {
    if (err instanceof z.ZodError) return fail(res, 400, err.errors[0]?.message || 'Invalid input')
    return handleError(res, err)
  }
}

/** DELETE /api/memos/:id — author only, draft only */
export async function deleteMemo(req: VercelRequest, res: VercelResponse, memoId: string) {
  try {
    const ctx = await requireAuth(req)
    const existing = await assertMemoAccess(memoId, ctx.organizationId)
    if (existing.authorId !== ctx.user.id) throw new ApiError(403, 'Only the author can delete this memo')
    if (existing.status !== 'DRAFT') throw new ApiError(400, 'Only draft memos can be deleted')

    await prisma.memo.delete({ where: { id: memoId } })

    await logAudit({
      organizationId: ctx.organizationId,
      userId: ctx.user.id,
      eventType: 'memo.deleted',
      entityType: 'Memo',
      entityId: memoId,
      description: `${ctx.user.name} deleted draft memo "${existing.subject}"`,
    })

    return ok(res, { message: 'Memo deleted' })
  } catch (err) {
    return handleError(res, err)
  }
}

/** POST /api/memos/:id/cancel — author withdraws a memo that's still in-flight */
export async function cancelMemo(req: VercelRequest, res: VercelResponse, memoId: string) {
  try {
    const ctx = await requireAuth(req)
    const existing = await assertMemoAccess(memoId, ctx.organizationId)
    if (existing.authorId !== ctx.user.id) throw new ApiError(403, 'Only the author can cancel this memo')
    if (!['SUBMITTED', 'PENDING_REVIEW', 'PENDING_APPROVAL', 'CHANGES_REQUESTED'].includes(existing.status)) {
      throw new ApiError(400, 'Only an in-progress memo can be cancelled')
    }

    const memo = await prisma.memo.update({
      where: { id: memoId },
      data: { status: 'CANCELLED' },
      include: MEMO_INCLUDE,
    })

    await logAudit({
      organizationId: ctx.organizationId,
      userId: ctx.user.id,
      eventType: 'memo.cancelled',
      entityType: 'Memo',
      entityId: memoId,
      description: `${ctx.user.name} cancelled memo "${existing.subject}"`,
    })

    return ok(res, { memo })
  } catch (err) {
    return handleError(res, err)
  }
}

const submitMemoSchema = z.object({
  approvers: z
    .array(
      z.object({
        userId: z.string().uuid(),
        title: z.string().optional(),
      })
    )
    .min(1, 'At least one approver is required'),
})

/** POST /api/memos/:id/submit — defines the workflow and kicks it off */
export async function submitMemo(req: VercelRequest, res: VercelResponse, memoId: string) {
  try {
    const ctx = await requireAuth(req)
    const existing = await assertMemoAccess(memoId, ctx.organizationId)

    if (existing.authorId !== ctx.user.id) throw new ApiError(403, 'Only the author can submit this memo')
    if (!['DRAFT', 'CHANGES_REQUESTED'].includes(existing.status)) {
      throw new ApiError(400, 'Memo has already been submitted')
    }

    const body = submitMemoSchema.parse(req.body)

    const approverIds = body.approvers.map((a) => a.userId)
    const validUsers = await prisma.user.findMany({
      where: { id: { in: approverIds }, organizationId: ctx.organizationId, status: 'ACTIVE' },
    })
    if (validUsers.length !== approverIds.length) {
      throw new ApiError(400, 'One or more selected approvers are invalid')
    }

    const org = await prisma.organization.findUniqueOrThrow({ where: { id: ctx.organizationId } })
    const isResubmit = existing.status === 'CHANGES_REQUESTED'

    const memo = await prisma.$transaction(async (tx) => {
      // Clear any prior workflow steps if this is a resubmission
      if (isResubmit) {
        await tx.workflowStep.deleteMany({ where: { memoId } })
      }

      await tx.workflowStep.createMany({
        data: body.approvers.map((a, idx) => ({
          organizationId: ctx.organizationId,
          memoId,
          position: idx,
          title: a.title || null,
          approverId: a.userId,
          status: idx === 0 ? 'PENDING' : 'PENDING',
        })),
      })

      const memoNumber = isResubmit ? existing.memoNumber : await generateMemoNumber(ctx.organizationId, org.slug)

      return tx.memo.update({
        where: { id: memoId },
        data: {
          status: 'PENDING_REVIEW',
          currentStepIndex: 0,
          memoNumber,
          submittedAt: new Date(),
        },
        include: MEMO_INCLUDE,
      })
    })

    const firstApprover = body.approvers[0]
    await notify({
      organizationId: ctx.organizationId,
      userId: firstApprover.userId,
      memoId,
      type: isResubmit ? 'RESUBMITTED' : 'ASSIGNED',
      message: `${ctx.user.name} submitted "${memo.subject}" (${memo.memoNumber}) for your review`,
    })

    await logAudit({
      organizationId: ctx.organizationId,
      userId: ctx.user.id,
      eventType: 'memo.submitted',
      entityType: 'Memo',
      entityId: memo.id,
      description: `${ctx.user.name} submitted memo "${memo.subject}" (${memo.memoNumber}) with ${body.approvers.length} approver(s)`,
    })

    return ok(res, { memo })
  } catch (err) {
    if (err instanceof z.ZodError) return fail(res, 400, err.errors[0]?.message || 'Invalid input')
    return handleError(res, err)
  }
}
