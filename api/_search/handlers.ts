import type { VercelRequest, VercelResponse } from '@vercel/node'
import { prisma } from '../_lib/prisma'
import { requireAuth } from '../_lib/auth'
import { ok, handleError } from '../_lib/response'

/** GET /api/search */
export async function search(req: VercelRequest, res: VercelResponse) {
  try {
    const ctx = await requireAuth(req)
    const { q, status, priority, departmentId, categoryId, dateFrom, dateTo, limit = '50', offset = '0' } =
      req.query as Record<string, string>

    const where: any = { organizationId: ctx.organizationId }
    if (q) {
      where.OR = [
        { subject: { contains: q, mode: 'insensitive' } },
        { body: { contains: q, mode: 'insensitive' } },
        { memoNumber: { contains: q, mode: 'insensitive' } },
        { author: { name: { contains: q, mode: 'insensitive' } } },
      ]
    }
    if (status) where.status = status
    if (priority) where.priority = priority
    if (departmentId) where.departmentId = departmentId
    if (categoryId) where.categoryId = categoryId
    if (dateFrom || dateTo) {
      where.createdAt = {}
      if (dateFrom) where.createdAt.gte = new Date(dateFrom)
      if (dateTo) where.createdAt.lte = new Date(dateTo)
    }

    const [memos, total] = await Promise.all([
      prisma.memo.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        take: Math.min(Number(limit) || 50, 100),
        skip: Number(offset) || 0,
        include: {
          author: { select: { id: true, name: true } },
          department: true,
          category: true,
        },
      }),
      prisma.memo.count({ where }),
    ])

    return ok(res, { memos, total })
  } catch (err) {
    return handleError(res, err)
  }
}
