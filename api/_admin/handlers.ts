import type { VercelRequest, VercelResponse } from '@vercel/node'
import { z } from 'zod'
import { prisma } from '../_lib/prisma'
import { requireAuth, requireAdmin, supabaseAdmin } from '../_lib/auth'
import { ok, fail, handleError, ApiError } from '../_lib/response'
import { logAudit } from '../_lib/audit'

// ---------------- Users ----------------

/** GET /api/users — lightweight org directory, available to any authenticated user (e.g. approver pickers) */
export async function listUserDirectory(req: VercelRequest, res: VercelResponse) {
  try {
    const ctx = await requireAuth(req)
    const users = await prisma.user.findMany({
      where: { organizationId: ctx.organizationId, status: 'ACTIVE' },
      select: { id: true, name: true, email: true, departmentId: true },
      orderBy: { name: 'asc' },
    })
    return ok(res, { users })
  } catch (err) {
    return handleError(res, err)
  }
}

/** GET /api/admin/users */
export async function listUsers(req: VercelRequest, res: VercelResponse) {
  try {
    const ctx = await requireAuth(req)
    requireAdmin(ctx)
    const users = await prisma.user.findMany({
      where: { organizationId: ctx.organizationId },
      include: { department: true },
      orderBy: { createdAt: 'asc' },
    })
    return ok(res, { users })
  } catch (err) {
    return handleError(res, err)
  }
}

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
  designation: z.string().optional(),
  departmentId: z.string().uuid().optional().nullable(),
  role: z.enum(['ADMIN', 'USER']).optional(),
})

/** POST /api/admin/users — admin invites/creates a user in their org */
export async function createUser(req: VercelRequest, res: VercelResponse) {
  try {
    const ctx = await requireAuth(req)
    requireAdmin(ctx)
    const body = createUserSchema.parse(req.body)

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: body.email,
      password: body.password,
      email_confirm: true,
    })
    if (authError || !authData?.user) {
      return fail(res, 400, authError?.message || 'Failed to create account')
    }

    const user = await prisma.user.create({
      data: {
        authId: authData.user.id,
        organizationId: ctx.organizationId,
        email: body.email,
        name: body.name,
        designation: body.designation,
        departmentId: body.departmentId || null,
        role: body.role || 'USER',
      },
      include: { department: true },
    })

    await logAudit({
      organizationId: ctx.organizationId,
      userId: ctx.user.id,
      eventType: 'user.created',
      entityType: 'User',
      entityId: user.id,
      description: `${ctx.user.name} created user ${user.name} (${user.email})`,
    })

    return ok(res, { user }, 201)
  } catch (err) {
    if (err instanceof z.ZodError) return fail(res, 400, err.errors[0]?.message || 'Invalid input')
    return handleError(res, err)
  }
}

const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  designation: z.string().optional().nullable(),
  departmentId: z.string().uuid().optional().nullable(),
  role: z.enum(['ADMIN', 'USER']).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
})

/** PUT /api/admin/users/:id */
export async function updateUser(req: VercelRequest, res: VercelResponse, userId: string) {
  try {
    const ctx = await requireAuth(req)
    requireAdmin(ctx)
    const target = await prisma.user.findFirst({ where: { id: userId, organizationId: ctx.organizationId } })
    if (!target) throw new ApiError(404, 'User not found')

    const body = updateUserSchema.parse(req.body)
    const user = await prisma.user.update({ where: { id: userId }, data: body, include: { department: true } })

    await logAudit({
      organizationId: ctx.organizationId,
      userId: ctx.user.id,
      eventType: 'user.updated',
      entityType: 'User',
      entityId: user.id,
      description: `${ctx.user.name} updated user ${user.name}`,
    })

    return ok(res, { user })
  } catch (err) {
    if (err instanceof z.ZodError) return fail(res, 400, err.errors[0]?.message || 'Invalid input')
    return handleError(res, err)
  }
}

/** DELETE /api/admin/users/:id — soft delete (deactivate) */
export async function deactivateUser(req: VercelRequest, res: VercelResponse, userId: string) {
  try {
    const ctx = await requireAuth(req)
    requireAdmin(ctx)
    if (userId === ctx.user.id) throw new ApiError(400, 'You cannot deactivate your own account')

    const target = await prisma.user.findFirst({ where: { id: userId, organizationId: ctx.organizationId } })
    if (!target) throw new ApiError(404, 'User not found')

    const user = await prisma.user.update({ where: { id: userId }, data: { status: 'INACTIVE' } })

    await logAudit({
      organizationId: ctx.organizationId,
      userId: ctx.user.id,
      eventType: 'user.deactivated',
      entityType: 'User',
      entityId: user.id,
      description: `${ctx.user.name} deactivated user ${user.name}`,
    })

    return ok(res, { user })
  } catch (err) {
    return handleError(res, err)
  }
}

// ---------------- Departments ----------------

const deptSchema = z.object({ name: z.string().min(1), description: z.string().optional() })

/** GET /api/admin/departments */
export async function listDepartments(req: VercelRequest, res: VercelResponse) {
  try {
    const ctx = await requireAuth(req)
    const departments = await prisma.department.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: { name: 'asc' },
    })
    return ok(res, { departments })
  } catch (err) {
    return handleError(res, err)
  }
}

/** POST /api/admin/departments */
export async function createDepartment(req: VercelRequest, res: VercelResponse) {
  try {
    const ctx = await requireAuth(req)
    requireAdmin(ctx)
    const body = deptSchema.parse(req.body)
    const department = await prisma.department.create({
      data: { organizationId: ctx.organizationId, name: body.name, description: body.description },
    })
    return ok(res, { department }, 201)
  } catch (err) {
    if (err instanceof z.ZodError) return fail(res, 400, err.errors[0]?.message || 'Invalid input')
    return handleError(res, err)
  }
}

/** PUT /api/admin/departments/:id */
export async function updateDepartment(req: VercelRequest, res: VercelResponse, id: string) {
  try {
    const ctx = await requireAuth(req)
    requireAdmin(ctx)
    const existing = await prisma.department.findFirst({ where: { id, organizationId: ctx.organizationId } })
    if (!existing) throw new ApiError(404, 'Department not found')

    const body = z
      .object({ name: z.string().min(1).optional(), description: z.string().optional(), status: z.enum(['ACTIVE', 'INACTIVE']).optional() })
      .parse(req.body)
    const department = await prisma.department.update({ where: { id }, data: body })
    return ok(res, { department })
  } catch (err) {
    if (err instanceof z.ZodError) return fail(res, 400, err.errors[0]?.message || 'Invalid input')
    return handleError(res, err)
  }
}

// ---------------- Categories ----------------

const categorySchema = z.object({ name: z.string().min(1), description: z.string().optional() })

/** GET /api/admin/categories */
export async function listCategories(req: VercelRequest, res: VercelResponse) {
  try {
    const ctx = await requireAuth(req)
    const categories = await prisma.memoCategory.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: { name: 'asc' },
    })
    return ok(res, { categories })
  } catch (err) {
    return handleError(res, err)
  }
}

/** POST /api/admin/categories */
export async function createCategory(req: VercelRequest, res: VercelResponse) {
  try {
    const ctx = await requireAuth(req)
    requireAdmin(ctx)
    const body = categorySchema.parse(req.body)
    const category = await prisma.memoCategory.create({
      data: { organizationId: ctx.organizationId, name: body.name, description: body.description },
    })
    return ok(res, { category }, 201)
  } catch (err) {
    if (err instanceof z.ZodError) return fail(res, 400, err.errors[0]?.message || 'Invalid input')
    return handleError(res, err)
  }
}

/** PUT /api/admin/categories/:id */
export async function updateCategory(req: VercelRequest, res: VercelResponse, id: string) {
  try {
    const ctx = await requireAuth(req)
    requireAdmin(ctx)
    const existing = await prisma.memoCategory.findFirst({ where: { id, organizationId: ctx.organizationId } })
    if (!existing) throw new ApiError(404, 'Category not found')

    const body = z
      .object({ name: z.string().min(1).optional(), description: z.string().optional(), status: z.enum(['ACTIVE', 'INACTIVE']).optional() })
      .parse(req.body)
    const category = await prisma.memoCategory.update({ where: { id }, data: body })
    return ok(res, { category })
  } catch (err) {
    if (err instanceof z.ZodError) return fail(res, 400, err.errors[0]?.message || 'Invalid input')
    return handleError(res, err)
  }
}

// ---------------- Workflow templates ----------------

const templatePositionSchema = z.object({ position: z.number().int().min(0), title: z.string().min(1) })
const templateSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  positions: z.array(templatePositionSchema).min(1),
})

/** GET /api/admin/workflow-templates — readable by any authenticated user (used when creating a memo) */
export async function listWorkflowTemplates(req: VercelRequest, res: VercelResponse) {
  try {
    const ctx = await requireAuth(req)
    const templates = await prisma.workflowTemplate.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: { name: 'asc' },
    })
    return ok(res, { templates })
  } catch (err) {
    return handleError(res, err)
  }
}

/** POST /api/admin/workflow-templates */
export async function createWorkflowTemplate(req: VercelRequest, res: VercelResponse) {
  try {
    const ctx = await requireAuth(req)
    requireAdmin(ctx)
    const body = templateSchema.parse(req.body)
    const template = await prisma.workflowTemplate.create({
      data: {
        organizationId: ctx.organizationId,
        name: body.name,
        description: body.description,
        positions: body.positions,
      },
    })
    return ok(res, { template }, 201)
  } catch (err) {
    if (err instanceof z.ZodError) return fail(res, 400, err.errors[0]?.message || 'Invalid input')
    return handleError(res, err)
  }
}

/** DELETE /api/admin/workflow-templates/:id */
export async function deleteWorkflowTemplate(req: VercelRequest, res: VercelResponse, id: string) {
  try {
    const ctx = await requireAuth(req)
    requireAdmin(ctx)
    const existing = await prisma.workflowTemplate.findFirst({ where: { id, organizationId: ctx.organizationId } })
    if (!existing) throw new ApiError(404, 'Workflow template not found')
    await prisma.workflowTemplate.delete({ where: { id } })
    return ok(res, { message: 'Template deleted' })
  } catch (err) {
    return handleError(res, err)
  }
}

// ---------------- Organization ----------------

/** GET /api/admin/organization */
export async function getOrganization(req: VercelRequest, res: VercelResponse) {
  try {
    const ctx = await requireAuth(req)
    const organization = await prisma.organization.findUnique({ where: { id: ctx.organizationId } })
    return ok(res, { organization })
  } catch (err) {
    return handleError(res, err)
  }
}

/** PUT /api/admin/organization */
export async function updateOrganization(req: VercelRequest, res: VercelResponse) {
  try {
    const ctx = await requireAuth(req)
    requireAdmin(ctx)
    const body = z
      .object({ name: z.string().min(1).optional(), logoUrl: z.string().url().optional().nullable(), contactEmail: z.string().email().optional().nullable() })
      .parse(req.body)
    const organization = await prisma.organization.update({ where: { id: ctx.organizationId }, data: body })
    return ok(res, { organization })
  } catch (err) {
    if (err instanceof z.ZodError) return fail(res, 400, err.errors[0]?.message || 'Invalid input')
    return handleError(res, err)
  }
}

// ---------------- Dashboard ----------------

/** GET /api/admin/dashboard */
export async function adminDashboard(req: VercelRequest, res: VercelResponse) {
  try {
    const ctx = await requireAuth(req)
    requireAdmin(ctx)

    const { dateFrom, dateTo, departmentId, categoryId } = req.query as Record<string, string>
    const memoFilter: any = { organizationId: ctx.organizationId }
    if (dateFrom || dateTo) {
      memoFilter.createdAt = {}
      if (dateFrom) memoFilter.createdAt.gte = new Date(dateFrom)
      if (dateTo) memoFilter.createdAt.lte = new Date(dateTo)
    }
    if (departmentId) memoFilter.departmentId = departmentId
    if (categoryId) memoFilter.categoryId = categoryId

    const [
      totalUsers,
      activeUsers,
      totalDepartments,
      memosByStatus,
      memosByDepartmentRaw,
      memosByCategoryRaw,
      totalMemos,
      urgentPending,
      completedMemos,
      recentMemos,
      departments,
      categories,
    ] = await Promise.all([
      prisma.user.count({ where: { organizationId: ctx.organizationId } }),
      prisma.user.count({ where: { organizationId: ctx.organizationId, status: 'ACTIVE' } }),
      prisma.department.count({ where: { organizationId: ctx.organizationId } }),
      prisma.memo.groupBy({
        by: ['status'],
        where: memoFilter,
        _count: true,
      }),
      prisma.memo.groupBy({
        by: ['departmentId'],
        where: { ...memoFilter, departmentId: { not: null } },
        _count: true,
      }),
      prisma.memo.groupBy({
        by: ['categoryId'],
        where: { ...memoFilter, categoryId: { not: null } },
        _count: true,
      }),
      prisma.memo.count({ where: memoFilter }),
      prisma.memo.count({
        where: {
          ...memoFilter,
          priority: 'URGENT',
          status: { in: ['SUBMITTED', 'PENDING_REVIEW', 'PENDING_APPROVAL'] },
        },
      }),
      prisma.memo.findMany({
        where: { ...memoFilter, status: 'APPROVED', submittedAt: { not: null }, completedAt: { not: null } },
        select: { submittedAt: true, completedAt: true },
      }),
      prisma.memo.findMany({
        where: memoFilter,
        orderBy: { updatedAt: 'desc' },
        take: 10,
        include: { author: { select: { name: true } } },
      }),
      prisma.department.findMany({ where: { organizationId: ctx.organizationId }, select: { id: true, name: true } }),
      prisma.memoCategory.findMany({ where: { organizationId: ctx.organizationId }, select: { id: true, name: true } }),
    ])

    const deptNameById = new Map(departments.map((d) => [d.id, d.name]))
    const catNameById = new Map(categories.map((c) => [c.id, c.name]))
    const memosByDepartment = memosByDepartmentRaw.map((r) => ({
      departmentId: r.departmentId,
      name: deptNameById.get(r.departmentId!) || 'Unknown',
      count: r._count,
    }))
    const memosByCategory = memosByCategoryRaw.map((r) => ({
      categoryId: r.categoryId,
      name: catNameById.get(r.categoryId!) || 'Unknown',
      count: r._count,
    }))

    const avgCompletionHours =
      completedMemos.length > 0
        ? Math.round(
            (completedMemos.reduce((sum, m) => sum + (m.completedAt!.getTime() - m.submittedAt!.getTime()), 0) /
              completedMemos.length /
              3600000) *
              10
          ) / 10
        : null

    return ok(res, {
      totalUsers,
      activeUsers,
      totalDepartments,
      totalMemos,
      urgentPending,
      memosByStatus,
      memosByDepartment,
      memosByCategory,
      avgCompletionHours,
      recentMemos,
    })
  } catch (err) {
    return handleError(res, err)
  }
}

/** GET /api/dashboard — personal (non-admin) dashboard */
export async function userDashboard(req: VercelRequest, res: VercelResponse) {
  try {
    const ctx = await requireAuth(req)

    const [awaitingAction, submitted, completed, urgent, byStatus, recent] = await Promise.all([
      prisma.memo.count({
        where: {
          organizationId: ctx.organizationId,
          status: { in: ['SUBMITTED', 'PENDING_REVIEW', 'PENDING_APPROVAL'] },
          workflowSteps: { some: { approverId: ctx.user.id, status: 'PENDING' } },
        },
      }),
      prisma.memo.count({ where: { organizationId: ctx.organizationId, authorId: ctx.user.id, status: { not: 'DRAFT' } } }),
      prisma.memo.count({ where: { organizationId: ctx.organizationId, authorId: ctx.user.id, status: 'APPROVED' } }),
      prisma.memo.count({
        where: { organizationId: ctx.organizationId, authorId: ctx.user.id, priority: 'URGENT', status: { not: 'APPROVED' } },
      }),
      prisma.memo.groupBy({
        by: ['status'],
        where: { organizationId: ctx.organizationId, authorId: ctx.user.id },
        _count: true,
      }),
      prisma.memo.findMany({
        where: {
          organizationId: ctx.organizationId,
          OR: [{ authorId: ctx.user.id }, { workflowSteps: { some: { approverId: ctx.user.id } } }],
        },
        orderBy: { updatedAt: 'desc' },
        take: 10,
        include: { author: { select: { name: true } } },
      }),
    ])

    return ok(res, { awaitingAction, submitted, completed, urgent, byStatus, recent })
  } catch (err) {
    return handleError(res, err)
  }
}

// ---------------- Audit log ----------------

/** GET /api/admin/audit-log — admin-only, org-scoped, newest first */
export async function listAuditLog(req: VercelRequest, res: VercelResponse) {
  try {
    const ctx = await requireAuth(req)
    requireAdmin(ctx)
    const { eventType, entityType, limit = '50', offset = '0' } = req.query as Record<string, string>

    const where: any = { organizationId: ctx.organizationId }
    if (eventType) where.eventType = eventType
    if (entityType) where.entityType = entityType

    const [entries, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: Math.min(Number(limit) || 50, 200),
        skip: Number(offset) || 0,
        include: { user: { select: { id: true, name: true, email: true } } },
      }),
      prisma.auditLog.count({ where }),
    ])

    return ok(res, { entries, total })
  } catch (err) {
    return handleError(res, err)
  }
}
