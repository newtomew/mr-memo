import type { VercelRequest, VercelResponse } from '@vercel/node'
import { z } from 'zod'
import { prisma } from '../_lib/prisma'
import { requireAuth } from '../_lib/auth'
import { ok, fail, handleError, ApiError } from '../_lib/response'
import { notify } from '../_lib/notify'
import { logAudit } from '../_lib/audit'

const createCommentSchema = z.object({ content: z.string().min(1) })

/** POST /api/comments/:memoId */
export async function addComment(req: VercelRequest, res: VercelResponse, memoId: string) {
  try {
    const ctx = await requireAuth(req)
    const body = createCommentSchema.parse(req.body)

    const memo = await prisma.memo.findFirst({ where: { id: memoId, organizationId: ctx.organizationId } })
    if (!memo) throw new ApiError(404, 'Memo not found')

    const comment = await prisma.comment.create({
      data: {
        organizationId: ctx.organizationId,
        memoId,
        authorId: ctx.user.id,
        type: 'GENERAL',
        content: body.content,
      },
      include: { author: { select: { id: true, name: true, email: true } } },
    })

    // Notify author (if someone else commented) and the current approver.
    const recipients = new Set<string>()
    if (memo.authorId !== ctx.user.id) recipients.add(memo.authorId)
    const currentStep = await prisma.workflowStep.findFirst({ where: { memoId, position: memo.currentStepIndex } })
    if (currentStep && currentStep.approverId !== ctx.user.id) recipients.add(currentStep.approverId)

    for (const userId of recipients) {
      await notify({
        organizationId: ctx.organizationId,
        userId,
        memoId,
        type: 'COMMENT',
        message: `${ctx.user.name} commented on "${memo.subject}"`,
      })
    }

    await logAudit({
      organizationId: ctx.organizationId,
      userId: ctx.user.id,
      eventType: 'comment.created',
      entityType: 'Memo',
      entityId: memoId,
      description: `${ctx.user.name} commented on "${memo.subject}"`,
    })

    return ok(res, { comment }, 201)
  } catch (err) {
    if (err instanceof z.ZodError) return fail(res, 400, err.errors[0]?.message || 'Invalid input')
    return handleError(res, err)
  }
}

/** GET /api/comments/:memoId */
export async function listComments(req: VercelRequest, res: VercelResponse, memoId: string) {
  try {
    const ctx = await requireAuth(req)
    const memo = await prisma.memo.findFirst({ where: { id: memoId, organizationId: ctx.organizationId } })
    if (!memo) throw new ApiError(404, 'Memo not found')

    const comments = await prisma.comment.findMany({
      where: { memoId },
      orderBy: { createdAt: 'asc' },
      include: { author: { select: { id: true, name: true, email: true } } },
    })
    return ok(res, { comments })
  } catch (err) {
    return handleError(res, err)
  }
}
