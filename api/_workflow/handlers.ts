import type { VercelRequest, VercelResponse } from '@vercel/node'
import { z } from 'zod'
import { prisma } from '../_lib/prisma'
import { requireAuth } from '../_lib/auth'
import { ok, fail, handleError, ApiError } from '../_lib/response'
import { logAudit } from '../_lib/audit'
import { notify } from '../_lib/notify'
import type { PrismaClient } from '@prisma/client'

async function getActionableStep(tx: PrismaClient, memoId: string, organizationId: string, userId: string) {
  const memo = await tx.memo.findFirst({ where: { id: memoId, organizationId } })
  if (!memo) throw new ApiError(404, 'Memo not found')
  if (!['SUBMITTED', 'PENDING_REVIEW', 'PENDING_APPROVAL'].includes(memo.status)) {
    throw new ApiError(400, 'This memo is not currently awaiting approval')
  }

  const step = await tx.workflowStep.findFirst({
    where: { memoId, position: memo.currentStepIndex },
  })
  if (!step) throw new ApiError(400, 'No active workflow step found')

  // Direct match: the assigned approver, or someone this specific step was forwarded to.
  if (step.approverId === userId || step.delegatedToId === userId) {
    return { memo, step, actingOnBehalfOf: null as { id: string; name: string } | null }
  }

  // Standing delegation (spec §16): userId may act because the assigned
  // approver designated them to act on their behalf for a date range that
  // covers now, independent of any per-memo forward.
  const now = new Date()
  const delegation = await tx.delegation.findFirst({
    where: {
      organizationId,
      delegatingUserId: step.approverId,
      delegateId: userId,
      active: true,
      startDate: { lte: now },
      endDate: { gte: now },
    },
    include: { delegatingUser: { select: { id: true, name: true } } },
  })
  if (delegation) {
    return { memo, step, actingOnBehalfOf: delegation.delegatingUser }
  }

  throw new ApiError(403, 'You are not the current approver for this memo')
}

const reasonSchema = z.object({ reason: z.string().optional() })

/** Spec §16: a delegate's action must clearly identify both the delegate and
 * the user on whose behalf it was performed. */
function annotateDelegate(reason: string | undefined, onBehalfOf: { name: string } | null): string | undefined {
  if (!onBehalfOf) return reason
  const prefix = `[Acting on behalf of ${onBehalfOf.name}]`
  return reason ? `${prefix} ${reason}` : prefix
}

/** POST /api/workflow/:memoId/approve */
export async function approveStep(req: VercelRequest, res: VercelResponse, memoId: string) {
  try {
    const ctx = await requireAuth(req)
    const body = reasonSchema.parse(req.body || {})

    const result = await prisma.$transaction(async (tx) => {
      const { memo, step, actingOnBehalfOf } = await getActionableStep(tx as any, memoId, ctx.organizationId, ctx.user.id)
      const reason = annotateDelegate(body.reason, actingOnBehalfOf)

      await tx.workflowStep.update({ where: { id: step.id }, data: { status: 'APPROVED', actedAt: new Date() } })
      await tx.approval.create({
        data: {
          organizationId: ctx.organizationId,
          memoId,
          workflowStepId: step.id,
          decision: 'APPROVED',
          reason,
          decidedById: ctx.user.id,
        },
      })
      if (reason) {
        await tx.comment.create({
          data: {
            organizationId: ctx.organizationId,
            memoId,
            authorId: ctx.user.id,
            type: 'APPROVAL',
            content: reason,
          },
        })
      }

      const totalSteps = await tx.workflowStep.count({ where: { memoId } })
      const isFinal = memo.currentStepIndex + 1 >= totalSteps

      const updatedMemo = await tx.memo.update({
        where: { id: memoId },
        data: isFinal
          ? { status: 'APPROVED', completedAt: new Date() }
          : { status: 'PENDING_APPROVAL', currentStepIndex: memo.currentStepIndex + 1 },
      })

      return { memo: updatedMemo, isFinal, totalSteps }
    })

    if (result.isFinal) {
      const memo = await prisma.memo.findUniqueOrThrow({ where: { id: memoId } })
      await notify({
        organizationId: ctx.organizationId,
        userId: memo.authorId,
        memoId,
        type: 'COMPLETED',
        message: `Your memo "${memo.subject}" (${memo.memoNumber}) has been fully approved`,
      })
    } else {
      const nextStep = await prisma.workflowStep.findFirst({
        where: { memoId, position: result.memo.currentStepIndex },
      })
      if (nextStep) {
        await notify({
          organizationId: ctx.organizationId,
          userId: nextStep.approverId,
          memoId,
          type: 'ACTION_REQUIRED',
          message: `"${result.memo.subject}" (${result.memo.memoNumber}) is now awaiting your review`,
        })
      }
    }

    await logAudit({
      organizationId: ctx.organizationId,
      userId: ctx.user.id,
      eventType: 'workflow.approved',
      entityType: 'Memo',
      entityId: memoId,
      description: `${ctx.user.name} approved memo "${result.memo.subject}"`,
    })

    const memo = await prisma.memo.findUnique({ where: { id: memoId } })
    return ok(res, { memo })
  } catch (err) {
    if (err instanceof z.ZodError) return fail(res, 400, err.errors[0]?.message || 'Invalid input')
    return handleError(res, err)
  }
}

/** POST /api/workflow/:memoId/reject */
export async function rejectStep(req: VercelRequest, res: VercelResponse, memoId: string) {
  try {
    const ctx = await requireAuth(req)
    const body = reasonSchema.parse(req.body || {})
    if (!body.reason) return fail(res, 400, 'A reason is required to reject a memo')

    const result = await prisma.$transaction(async (tx) => {
      const { memo, step, actingOnBehalfOf } = await getActionableStep(tx as any, memoId, ctx.organizationId, ctx.user.id)
      const reason = annotateDelegate(body.reason, actingOnBehalfOf)!

      await tx.workflowStep.update({ where: { id: step.id }, data: { status: 'REJECTED', actedAt: new Date() } })
      await tx.approval.create({
        data: {
          organizationId: ctx.organizationId,
          memoId,
          workflowStepId: step.id,
          decision: 'REJECTED',
          reason,
          decidedById: ctx.user.id,
        },
      })
      await tx.comment.create({
        data: {
          organizationId: ctx.organizationId,
          memoId,
          authorId: ctx.user.id,
          type: 'REJECTION',
          content: reason,
        },
      })

      const updatedMemo = await tx.memo.update({
        where: { id: memoId },
        data: { status: 'REJECTED' },
      })
      return { memo: updatedMemo }
    })

    await notify({
      organizationId: ctx.organizationId,
      userId: result.memo.authorId,
      memoId,
      type: 'REJECTED',
      message: `${ctx.user.name} rejected your memo "${result.memo.subject}": ${body.reason}`,
    })

    await logAudit({
      organizationId: ctx.organizationId,
      userId: ctx.user.id,
      eventType: 'workflow.rejected',
      entityType: 'Memo',
      entityId: memoId,
      description: `${ctx.user.name} rejected memo "${result.memo.subject}"`,
    })

    return ok(res, { memo: result.memo })
  } catch (err) {
    if (err instanceof z.ZodError) return fail(res, 400, err.errors[0]?.message || 'Invalid input')
    return handleError(res, err)
  }
}

const changesSchema = z.object({ reason: z.string().min(1, 'A message is required') })

/** POST /api/workflow/:memoId/request-changes */
export async function requestChanges(req: VercelRequest, res: VercelResponse, memoId: string) {
  try {
    const ctx = await requireAuth(req)
    const body = changesSchema.parse(req.body || {})

    const result = await prisma.$transaction(async (tx) => {
      const { memo, step, actingOnBehalfOf } = await getActionableStep(tx as any, memoId, ctx.organizationId, ctx.user.id)
      const reason = annotateDelegate(body.reason, actingOnBehalfOf)!

      await tx.workflowStep.update({ where: { id: step.id }, data: { status: 'CHANGES_REQUESTED', actedAt: new Date() } })
      await tx.approval.create({
        data: {
          organizationId: ctx.organizationId,
          memoId,
          workflowStepId: step.id,
          decision: 'CHANGES_REQUESTED',
          reason,
          decidedById: ctx.user.id,
        },
      })
      await tx.comment.create({
        data: {
          organizationId: ctx.organizationId,
          memoId,
          authorId: ctx.user.id,
          type: 'CHANGE_REQUEST',
          content: reason,
        },
      })

      const updatedMemo = await tx.memo.update({
        where: { id: memoId },
        data: { status: 'CHANGES_REQUESTED' },
      })
      return { memo: updatedMemo }
    })

    await notify({
      organizationId: ctx.organizationId,
      userId: result.memo.authorId,
      memoId,
      type: 'CHANGES_REQUESTED',
      message: `${ctx.user.name} requested changes on "${result.memo.subject}": ${body.reason}`,
    })

    await logAudit({
      organizationId: ctx.organizationId,
      userId: ctx.user.id,
      eventType: 'workflow.changes_requested',
      entityType: 'Memo',
      entityId: memoId,
      description: `${ctx.user.name} requested changes on memo "${result.memo.subject}"`,
    })

    return ok(res, { memo: result.memo })
  } catch (err) {
    if (err instanceof z.ZodError) return fail(res, 400, err.errors[0]?.message || 'Invalid input')
    return handleError(res, err)
  }
}

const forwardSchema = z.object({ forwardToUserId: z.string().uuid() })

/** POST /api/workflow/:memoId/forward — delegate the current step to another user */
export async function forwardStep(req: VercelRequest, res: VercelResponse, memoId: string) {
  try {
    const ctx = await requireAuth(req)
    const body = forwardSchema.parse(req.body)

    const target = await prisma.user.findFirst({
      where: { id: body.forwardToUserId, organizationId: ctx.organizationId, status: 'ACTIVE' },
    })
    if (!target) throw new ApiError(400, 'Target user not found')

    const result = await prisma.$transaction(async (tx) => {
      const { memo, step } = await getActionableStep(tx as any, memoId, ctx.organizationId, ctx.user.id)
      await tx.workflowStep.update({ where: { id: step.id }, data: { delegatedToId: target.id } })
      await tx.approval.create({
        data: {
          organizationId: ctx.organizationId,
          memoId,
          workflowStepId: step.id,
          decision: 'FORWARDED',
          reason: `Forwarded to ${target.name}`,
          decidedById: ctx.user.id,
        },
      })
      return { memo }
    })

    await notify({
      organizationId: ctx.organizationId,
      userId: target.id,
      memoId,
      type: 'ASSIGNED',
      message: `${ctx.user.name} forwarded "${result.memo.subject}" to you for review`,
    })

    await logAudit({
      organizationId: ctx.organizationId,
      userId: ctx.user.id,
      eventType: 'workflow.forwarded',
      entityType: 'Memo',
      entityId: memoId,
      description: `${ctx.user.name} forwarded memo "${result.memo.subject}" to ${target.name}`,
    })

    const memo = await prisma.memo.findUnique({ where: { id: memoId } })
    return ok(res, { memo })
  } catch (err) {
    if (err instanceof z.ZodError) return fail(res, 400, err.errors[0]?.message || 'Invalid input')
    return handleError(res, err)
  }
}
