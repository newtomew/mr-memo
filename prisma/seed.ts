import { PrismaClient } from '@prisma/client'
import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

const prisma = new PrismaClient()

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment. Aborting seed.')
  process.exit(1)
}

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const DEMO_PASSWORD = 'Demo123!'

async function ensureAuthUser(email: string) {
  // createUser fails if the user already exists — look it up first.
  const { data: existingList } = await supabaseAdmin.auth.admin.listUsers()
  const existing = existingList?.users.find((u) => u.email === email)
  if (existing) return existing

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: DEMO_PASSWORD,
    email_confirm: true,
  })
  if (error || !data.user) throw new Error(`Failed to create auth user ${email}: ${error?.message}`)
  return data.user
}

async function main() {
  console.log('🌱 Seeding mr.memo demo data...')

  // 1. Organization
  const org = await prisma.organization.upsert({
    where: { slug: 'demo-company' },
    update: {},
    create: {
      name: 'Demo Company',
      slug: 'demo-company',
      contactEmail: 'contact@demo.com',
    },
  })
  console.log(`✓ Organization: ${org.name}`)

  // 2. Departments
  const [hr, finance, it] = await Promise.all(
    ['HR', 'Finance', 'IT'].map((name) =>
      prisma.department.upsert({
        where: { organizationId_name: { organizationId: org.id, name } },
        update: {},
        create: { organizationId: org.id, name, description: `${name} department` },
      })
    )
  )
  console.log('✓ Departments: HR, Finance, IT')

  // 3. Categories
  const [admin, financial, technical] = await Promise.all(
    ['Administrative', 'Financial', 'Technical'].map((name) =>
      prisma.memoCategory.upsert({
        where: { organizationId_name: { organizationId: org.id, name } },
        update: {},
        create: { organizationId: org.id, name, description: `${name} memos` },
      })
    )
  )
  console.log('✓ Categories: Administrative, Financial, Technical')

  // 4. Users (5 demo accounts, all password Demo123!)
  const userDefs = [
    { email: 'admin@demo.com', name: 'Alice Admin', role: 'ADMIN' as const, departmentId: hr.id, designation: 'Org Administrator' },
    { email: 'employee@demo.com', name: 'John Employee', role: 'USER' as const, departmentId: it.id, designation: 'Software Engineer' },
    { email: 'manager@demo.com', name: 'Jane Manager', role: 'USER' as const, departmentId: it.id, designation: 'Engineering Manager' },
    { email: 'finance@demo.com', name: 'Bob Finance', role: 'USER' as const, departmentId: finance.id, designation: 'Finance Officer' },
    { email: 'hr@demo.com', name: 'Helen HR', role: 'USER' as const, departmentId: hr.id, designation: 'HR Officer' },
  ]

  const users: Record<string, Awaited<ReturnType<typeof prisma.user.create>>> = {}
  for (const def of userDefs) {
    const authUser = await ensureAuthUser(def.email)
    const user = await prisma.user.upsert({
      where: { authId: authUser.id },
      update: {},
      create: {
        authId: authUser.id,
        organizationId: org.id,
        email: def.email,
        name: def.name,
        role: def.role,
        designation: def.designation,
        departmentId: def.departmentId,
      },
    })
    users[def.email] = user
    console.log(`✓ User: ${def.email} / ${DEMO_PASSWORD} (${def.role})`)
  }

  // 5. Workflow template
  await prisma.workflowTemplate.upsert({
    where: { id: 'seed-template-purchase' },
    update: {},
    create: {
      id: 'seed-template-purchase',
      organizationId: org.id,
      name: 'Purchase Request',
      description: 'Manager → Finance → Director approval chain',
      positions: [{ position: 0, title: 'Manager' }, { position: 1, title: 'Finance' }],
    },
  }).catch(() => {
    // upsert on non-unique custom id may fail on repeat runs with differing schema; ignore.
  })

  // 6. Sample memo — approved end-to-end
  const existingMemo = await prisma.memo.findFirst({ where: { organizationId: org.id, memoNumber: 'DEMO-2026-001' } })
  if (!existingMemo) {
    const memo = await prisma.memo.create({
      data: {
        organizationId: org.id,
        authorId: users['employee@demo.com'].id,
        memoNumber: 'DEMO-2026-001',
        subject: 'Request: 5 new development laptops for Q3',
        body: 'Our team needs 5 new development laptops to support the Q3 roadmap. Quotes attached for review.',
        priority: 'HIGH',
        categoryId: technical.id,
        departmentId: it.id,
        status: 'APPROVED',
        currentStepIndex: 2,
        submittedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
        completedAt: new Date(),
      },
    })

    const steps = await Promise.all([
      prisma.workflowStep.create({
        data: {
          organizationId: org.id,
          memoId: memo.id,
          position: 0,
          title: 'Manager',
          approverId: users['manager@demo.com'].id,
          status: 'APPROVED',
          actedAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
        },
      }),
      prisma.workflowStep.create({
        data: {
          organizationId: org.id,
          memoId: memo.id,
          position: 1,
          title: 'Finance',
          approverId: users['finance@demo.com'].id,
          status: 'APPROVED',
          actedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        },
      }),
    ])

    for (const step of steps) {
      await prisma.approval.create({
        data: {
          organizationId: org.id,
          memoId: memo.id,
          workflowStepId: step.id,
          decision: 'APPROVED',
          reason: 'Approved — within budget',
          decidedById: step.approverId,
          decidedAt: step.actedAt!,
        },
      })
    }

    await prisma.comment.create({
      data: {
        organizationId: org.id,
        memoId: memo.id,
        authorId: users['manager@demo.com'].id,
        type: 'APPROVAL',
        content: 'Approved — within budget',
      },
    })

    console.log(`✓ Sample memo: ${memo.memoNumber} (fully approved)`)
  }

  // 7. Pending memo — sits in manager's inbox
  const existingPending = await prisma.memo.findFirst({ where: { organizationId: org.id, memoNumber: 'DEMO-2026-002' } })
  if (!existingPending) {
    const memo = await prisma.memo.create({
      data: {
        organizationId: org.id,
        authorId: users['employee@demo.com'].id,
        memoNumber: 'DEMO-2026-002',
        subject: 'Leave request — 3 days',
        body: 'Requesting 3 days of annual leave starting next Monday.',
        priority: 'NORMAL',
        categoryId: admin.id,
        departmentId: it.id,
        status: 'PENDING_REVIEW',
        currentStepIndex: 0,
        submittedAt: new Date(),
      },
    })
    await prisma.workflowStep.create({
      data: {
        organizationId: org.id,
        memoId: memo.id,
        position: 0,
        title: 'Manager',
        approverId: users['manager@demo.com'].id,
        status: 'PENDING',
      },
    })
    await prisma.notification.create({
      data: {
        organizationId: org.id,
        userId: users['manager@demo.com'].id,
        memoId: memo.id,
        type: 'ACTION_REQUIRED',
        message: `John Employee submitted "${memo.subject}" (${memo.memoNumber}) for your review`,
      },
    })
    console.log(`✓ Sample memo: ${memo.memoNumber} (pending in manager@demo.com's inbox)`)
  }

  console.log('\n✅ Seed complete!')
  console.log('   Demo credentials (all users): password = Demo123!')
  userDefs.forEach((u) => console.log(`   - ${u.email} (${u.role})`))
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
