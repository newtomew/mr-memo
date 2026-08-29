import type { VercelRequest, VercelResponse } from '@vercel/node'
import { prisma } from '../_lib/prisma'
import { fail } from '../_lib/response'
import { notify } from '../_lib/notify'
import type { MemoStatus } from '@prisma/client'

const AWAITING_STATUSES: MemoStatus[] = ['SUBMITTED', 'PENDING_REVIEW', 'PENDING_APPROVAL']
const MANAGER_ESCALATION_DAYS = 2
const EMPLOYEE_ESCALATION_DAYS = 5

/**
 * GET /api/cron/stale-check — invoked daily by Vercel Cron (see vercel.json).
 * Escalates memos that have sat awaiting approval too long:
 *  - >2 days: every ACTIVE Admin/Manager in the memo's org is notified
 *  - >5 days: the memo's own author is notified
 * Each (memo, recipient, milestone) pair is only ever notified once — a
 * lightweight de-dupe check against existing Notification rows — so this can
 * safely run every day without re-spamming the same people.
 */
export async function staleCheck(req: VercelRequest, res: VercelResponse) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return fail(res, 401, 'Unauthorized')
  }

  const now = Date.now()
  const managerThreshold = new Date(now - MANAGER_ESCALATION_DAYS * 24 * 60 * 60 * 1000)
  const employeeThreshold = new Date(now - EMPLOYEE_ESCALATION_DAYS * 24 * 60 * 60 * 1000)

  const staleMemos = await prisma.memo.findMany({
    where: {
      status: { in: AWAITING_STATUSES },
      submittedAt: { lte: managerThreshold },
    },
    select: { id: true, organizationId: true, authorId: true, subject: true, memoNumber: true, submittedAt: true, author: { select: { name: true } } },
  })

  let managerNotifications = 0
  let employeeNotifications = 0

  for (const memo of staleMemos) {
    const daysPending = Math.floor((now - memo.submittedAt!.getTime()) / (24 * 60 * 60 * 1000))

    const reviewers = await prisma.user.findMany({
      where: { organizationId: memo.organizationId, status: 'ACTIVE', role: { in: ['ADMIN', 'MANAGER'] } },
      select: { id: true },
    })
    for (const reviewer of reviewers) {
      const already = await prisma.notification.findFirst({
        where: { memoId: memo.id, userId: reviewer.id, type: 'STALE_PENDING' },
      })
      if (already) continue
      await notify({
        organizationId: memo.organizationId,
        userId: reviewer.id,
        memoId: memo.id,
        type: 'STALE_PENDING',
        message: `"${memo.subject}" (${memo.memoNumber}) has been awaiting approval for ${daysPending} days`,
      })
      managerNotifications++
    }

    if (memo.submittedAt! <= employeeThreshold) {
      const already = await prisma.notification.findFirst({
        where: { memoId: memo.id, userId: memo.authorId, type: 'STALE_PENDING' },
      })
      if (!already) {
        await notify({
          organizationId: memo.organizationId,
          userId: memo.authorId,
          memoId: memo.id,
          type: 'STALE_PENDING',
          message: `Your memo "${memo.subject}" (${memo.memoNumber}) has been awaiting approval for ${daysPending} days`,
        })
        employeeNotifications++
      }
    }
  }

  return res.status(200).json({
    success: true,
    data: { memosChecked: staleMemos.length, managerNotifications, employeeNotifications },
  })
}
