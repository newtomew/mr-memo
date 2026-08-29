// Black-box integration test suite for mr.memo's API.
// Hits the real running dev API server (see scripts/dev-server.ts) against
// the real Supabase project — no mocks. Creates two throwaway orgs to
// exercise multi-tenant isolation. Deliberately does NOT open its own
// PrismaClient: the dev API server already holds a connection pool against
// Supabase's free-tier PgBouncer pooler, and a second independent pool from
// this script was observed to exhaust the shared pooler and hang interactive
// $transaction() calls. Cleanup of fixtures created here is done out-of-band
// via the Supabase MCP after the run, not from within this process.
//
// Run: npm test   (requires `npm run dev:api` already running on :8081)

import 'dotenv/config'

const BASE = process.env.TEST_API_URL || 'http://localhost:8081/api'

// ---------------------------------------------------------------- harness
interface Result {
  name: string
  pass: boolean
  error?: string
}
const results: Result[] = []

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn()
    results.push({ name, pass: true })
    console.log(`  \x1b[32m✓\x1b[0m ${name}`)
  } catch (err: any) {
    results.push({ name, pass: false, error: err?.message || String(err) })
    console.log(`  \x1b[31m✗\x1b[0m ${name}`)
    console.log(`      ${err?.message || err}`)
  }
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg)
}
function assertEqual(actual: unknown, expected: unknown, msg: string) {
  if (actual !== expected) throw new Error(`${msg} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
}

async function call(path: string, opts: { method?: string; token?: string; body?: unknown } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method: opts.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    signal: AbortSignal.timeout(15000),
  })
  const text = await res.text()
  let json: any
  try {
    json = JSON.parse(text)
  } catch {
    json = { raw: text }
  }
  return { status: res.status, json }
}

// ---------------------------------------------------------------- fixtures
const RUN_ID = Date.now()
const ORG_A_ADMIN_EMAIL = `qa-admin-a-${RUN_ID}@qatest.local`
const ORG_B_ADMIN_EMAIL = `qa-admin-b-${RUN_ID}@qatest.local`
const PW = 'QaTest123!'

let orgAId = ''
let orgBId = ''
let adminAToken = '', adminBToken = ''
let managerAEmail = '', employeeAEmail = ''
let managerAToken = '', employeeAToken = ''
let managerAId = '', employeeAId = '', adminAId = ''
let deptAId = '', catAId = ''

const createdAuthEmails: string[] = []

async function registerOrgAdmin(orgName: string, name: string, email: string) {
  createdAuthEmails.push(email)
  const res = await call('/auth/register', {
    method: 'POST',
    body: { organizationName: orgName, name, email, password: PW },
  })
  assertEqual(res.status, 201, `register ${email} should succeed`)
  return res.json.data
}

async function login(email: string) {
  const res = await call('/auth/login', { method: 'POST', body: { email, password: PW } })
  assertEqual(res.status, 200, `login ${email} should succeed`)
  return res.json.data
}

// ---------------------------------------------------------------- suite
async function main() {
  console.log(`\nmr.memo API integration suite — target ${BASE}\n`)

  console.log('Setup')
  await test('register Org A admin', async () => {
    const data = await registerOrgAdmin(`QA Org A ${RUN_ID}`, 'QA Admin A', ORG_A_ADMIN_EMAIL)
    orgAId = data.organization.id
    adminAId = data.user.id
  })
  await test('register Org B admin', async () => {
    const data = await registerOrgAdmin(`QA Org B ${RUN_ID}`, 'QA Admin B', ORG_B_ADMIN_EMAIL)
    orgBId = data.organization.id
  })
  await test('login as Org A admin', async () => {
    const data = await login(ORG_A_ADMIN_EMAIL)
    adminAToken = data.session.accessToken
  })
  await test('login as Org B admin', async () => {
    const data = await login(ORG_B_ADMIN_EMAIL)
    adminBToken = data.session.accessToken
  })
  await test('org A admin creates department + category', async () => {
    const dept = await call('/admin/departments', { method: 'POST', token: adminAToken, body: { name: `QA Dept ${RUN_ID}` } })
    assertEqual(dept.status, 201, 'create department')
    deptAId = dept.json.data.department.id
    const cat = await call('/admin/categories', { method: 'POST', token: adminAToken, body: { name: `QA Cat ${RUN_ID}` } })
    assertEqual(cat.status, 201, 'create category')
    catAId = cat.json.data.category.id
  })
  await test('org A admin creates manager + employee users', async () => {
    managerAEmail = `qa-manager-a-${RUN_ID}@qatest.local`
    employeeAEmail = `qa-employee-a-${RUN_ID}@qatest.local`
    createdAuthEmails.push(managerAEmail, employeeAEmail)
    const m = await call('/admin/users', { method: 'POST', token: adminAToken, body: { name: 'QA Manager A', email: managerAEmail, password: PW } })
    assertEqual(m.status, 201, 'create manager')
    managerAId = m.json.data.user.id
    const e = await call('/admin/users', { method: 'POST', token: adminAToken, body: { name: 'QA Employee A', email: employeeAEmail, password: PW } })
    assertEqual(e.status, 201, 'create employee')
    employeeAId = e.json.data.user.id
  })
  await test('manager A and employee A can log in immediately (no email verification gate)', async () => {
    const m = await login(managerAEmail)
    managerAToken = m.session.accessToken
    const e = await login(employeeAEmail)
    employeeAToken = e.session.accessToken
  })

  console.log('\nAuth boundaries')
  await test('login with wrong password fails 401', async () => {
    const res = await call('/auth/login', { method: 'POST', body: { email: ORG_A_ADMIN_EMAIL, password: 'wrong-password' } })
    assertEqual(res.status, 401, 'wrong password')
  })
  await test('/auth/me with no token returns 401', async () => {
    const res = await call('/auth/me')
    assertEqual(res.status, 401, 'no token')
  })
  await test('/auth/me with garbage token returns 401', async () => {
    const res = await call('/auth/me', { token: 'not-a-real-token' })
    assertEqual(res.status, 401, 'garbage token')
  })
  await test('/auth/me with valid token returns matching profile', async () => {
    const res = await call('/auth/me', { token: employeeAToken })
    assertEqual(res.status, 200, 'valid token')
    assertEqual(res.json.data.user.email, employeeAEmail, 'profile email matches')
  })
  await test('register with invalid email is rejected (400)', async () => {
    const res = await call('/auth/register', { method: 'POST', body: { organizationName: 'x', name: 'x', email: 'not-an-email', password: PW } })
    assertEqual(res.status, 400, 'invalid email')
  })
  await test('register with short password is rejected (400)', async () => {
    const res = await call('/auth/register', { method: 'POST', body: { organizationName: 'x', name: 'x', email: `short-${RUN_ID}@qatest.local`, password: '123' } })
    assertEqual(res.status, 400, 'short password')
  })

  console.log('\nMemo CRUD + authorization')
  let draftMemoId = ''
  await test('employee creates a draft memo', async () => {
    const res = await call('/memos', {
      method: 'POST',
      token: employeeAToken,
      body: { subject: `QA draft ${RUN_ID}`, body: 'draft body', departmentId: deptAId, categoryId: catAId, priority: 'NORMAL' },
    })
    assertEqual(res.status, 201, 'create draft')
    assertEqual(res.json.data.memo.status, 'DRAFT', 'status is draft')
    draftMemoId = res.json.data.memo.id
  })
  await test('author can update their own draft', async () => {
    const res = await call(`/memos/${draftMemoId}`, { method: 'PUT', token: employeeAToken, body: { subject: `QA draft updated ${RUN_ID}` } })
    assertEqual(res.status, 200, 'update draft')
    assertEqual(res.json.data.memo.subject, `QA draft updated ${RUN_ID}`, 'subject changed')
  })
  await test('non-author cannot update someone else’s draft (403)', async () => {
    const res = await call(`/memos/${draftMemoId}`, { method: 'PUT', token: managerAToken, body: { subject: 'hijacked' } })
    assertEqual(res.status, 403, 'non-author blocked')
  })
  await test('creating a memo with empty subject is rejected (400)', async () => {
    const res = await call('/memos', { method: 'POST', token: employeeAToken, body: { subject: '', body: 'x' } })
    assertEqual(res.status, 400, 'empty subject rejected')
  })

  console.log('\nWorkflow: single-step approve')
  let singleStepMemoId = ''
  await test('employee submits memo with manager as sole approver', async () => {
    const create = await call('/memos', { method: 'POST', token: employeeAToken, body: { subject: `QA single-step ${RUN_ID}`, body: 'body' } })
    singleStepMemoId = create.json.data.memo.id
    const res = await call(`/memos/${singleStepMemoId}/submit`, { method: 'POST', token: employeeAToken, body: { approvers: [{ userId: managerAId, title: 'Manager' }] } })
    assertEqual(res.status, 200, 'submit')
    assertEqual(res.json.data.memo.status, 'PENDING_REVIEW', 'status pending review')
    assert(res.json.data.memo.memoNumber && !res.json.data.memo.memoNumber.startsWith('DRAFT-'), 'memo number generated')
  })
  await test('non-approver cannot approve (403)', async () => {
    const res = await call(`/workflow/${singleStepMemoId}/approve`, { method: 'POST', token: employeeAToken, body: {} })
    assertEqual(res.status, 403, 'author is not the approver')
  })
  await test('correct approver approves → memo fully approved (single step)', async () => {
    const res = await call(`/workflow/${singleStepMemoId}/approve`, { method: 'POST', token: managerAToken, body: { reason: 'looks good' } })
    assertEqual(res.status, 200, 'approve')
    assertEqual(res.json.data.memo.status, 'APPROVED', 'final status approved')
  })
  await test('author receives a COMPLETED notification', async () => {
    const res = await call('/notifications', { token: employeeAToken })
    assertEqual(res.status, 200, 'list notifications')
    const found = res.json.data.notifications.some((n: any) => n.memo?.id === singleStepMemoId && n.type === 'COMPLETED')
    assert(found, 'completed notification present')
  })

  console.log('\nWorkflow: reject')
  let rejectMemoId = ''
  await test('reject requires a reason (400)', async () => {
    const create = await call('/memos', { method: 'POST', token: employeeAToken, body: { subject: `QA reject ${RUN_ID}`, body: 'body' } })
    rejectMemoId = create.json.data.memo.id
    await call(`/memos/${rejectMemoId}/submit`, { method: 'POST', token: employeeAToken, body: { approvers: [{ userId: managerAId }] } })
    const res = await call(`/workflow/${rejectMemoId}/reject`, { method: 'POST', token: managerAToken, body: {} })
    assertEqual(res.status, 400, 'reject without reason rejected')
  })
  await test('reject with reason sets status REJECTED', async () => {
    const res = await call(`/workflow/${rejectMemoId}/reject`, { method: 'POST', token: managerAToken, body: { reason: 'not approved, budget exceeded' } })
    assertEqual(res.status, 200, 'reject')
    assertEqual(res.json.data.memo.status, 'REJECTED', 'status rejected')
  })

  console.log('\nWorkflow: request changes → edit → resubmit')
  let changesMemoId = ''
  await test('manager requests changes', async () => {
    const create = await call('/memos', { method: 'POST', token: employeeAToken, body: { subject: `QA changes ${RUN_ID}`, body: 'original body' } })
    changesMemoId = create.json.data.memo.id
    await call(`/memos/${changesMemoId}/submit`, { method: 'POST', token: employeeAToken, body: { approvers: [{ userId: managerAId }] } })
    const res = await call(`/workflow/${changesMemoId}/request-changes`, { method: 'POST', token: managerAToken, body: { reason: 'please add more detail' } })
    assertEqual(res.status, 200, 'request changes')
    assertEqual(res.json.data.memo.status, 'CHANGES_REQUESTED', 'status changes requested')
  })
  await test('author edits memo → a MemoVersion snapshot is created', async () => {
    const res = await call(`/memos/${changesMemoId}`, { method: 'PUT', token: employeeAToken, body: { body: 'revised body with more detail' } })
    assertEqual(res.status, 200, 'edit after changes-requested')
    const detail = await call(`/memos/${changesMemoId}`, { token: employeeAToken })
    assertEqual(detail.json.data.memo.versions.length, 1, 'one version snapshot recorded')
  })
  await test('author resubmits → workflow restarts', async () => {
    const res = await call(`/memos/${changesMemoId}/submit`, { method: 'POST', token: employeeAToken, body: { approvers: [{ userId: managerAId }] } })
    assertEqual(res.status, 200, 'resubmit')
    assertEqual(res.json.data.memo.status, 'PENDING_REVIEW', 'back to pending review')
    assertEqual(res.json.data.memo.currentStepIndex, 0, 'step index reset')
  })

  console.log('\nWorkflow: multi-step + forward/delegate')
  let multiStepMemoId = ''
  await test('two-step workflow: first approval advances to step 2', async () => {
    const create = await call('/memos', { method: 'POST', token: employeeAToken, body: { subject: `QA multi-step ${RUN_ID}`, body: 'body' } })
    multiStepMemoId = create.json.data.memo.id
    await call(`/memos/${multiStepMemoId}/submit`, {
      method: 'POST',
      token: employeeAToken,
      body: { approvers: [{ userId: managerAId, title: 'Manager' }, { userId: adminAId, title: 'Director' }] },
    })
    const res = await call(`/workflow/${multiStepMemoId}/approve`, { method: 'POST', token: managerAToken, body: {} })
    assertEqual(res.status, 200, 'step 1 approve')
    assertEqual(res.json.data.memo.status, 'PENDING_APPROVAL', 'now pending step 2')
    assertEqual(res.json.data.memo.currentStepIndex, 1, 'advanced to index 1')
  })
  await test('step-1 approver cannot act again on step 2 (403)', async () => {
    const res = await call(`/workflow/${multiStepMemoId}/approve`, { method: 'POST', token: managerAToken, body: {} })
    assertEqual(res.status, 403, 'manager already acted, not current approver')
  })
  await test('step-2 approver forwards to employee (delegate)', async () => {
    const res = await call(`/workflow/${multiStepMemoId}/forward`, { method: 'POST', token: adminAToken, body: { forwardToUserId: employeeAId } })
    assertEqual(res.status, 200, 'forward')
  })
  await test('delegate approves on behalf of step-2 approver → memo fully approved', async () => {
    const res = await call(`/workflow/${multiStepMemoId}/approve`, { method: 'POST', token: employeeAToken, body: {} })
    assertEqual(res.status, 200, 'delegate approve')
    assertEqual(res.json.data.memo.status, 'APPROVED', 'final approved via delegate')
  })

  console.log('\nStanding delegation (spec §16, distinct from per-memo forward)')
  let delegatedMemoId = ''
  await test('manager delegates approval authority to employee for a date range covering today', async () => {
    const today = new Date()
    const start = new Date(today.getTime() - 24 * 3600 * 1000).toISOString().slice(0, 10)
    const end = new Date(today.getTime() + 24 * 3600 * 1000).toISOString().slice(0, 10)
    const res = await call('/delegations', {
      method: 'POST',
      token: managerAToken,
      body: { delegateId: employeeAId, startDate: start, endDate: end, reason: 'QA coverage test' },
    })
    assertEqual(res.status, 201, 'create delegation')
  })
  await test('employee can approve a memo assigned to manager, via standing delegation (no forward needed)', async () => {
    const create = await call('/memos', { method: 'POST', token: adminAToken, body: { subject: `QA delegation ${RUN_ID}`, body: 'body' } })
    delegatedMemoId = create.json.data.memo.id
    await call(`/memos/${delegatedMemoId}/submit`, { method: 'POST', token: adminAToken, body: { approvers: [{ userId: managerAId, title: 'Manager' }] } })
    const res = await call(`/workflow/${delegatedMemoId}/approve`, { method: 'POST', token: employeeAToken, body: {} })
    assertEqual(res.status, 200, 'delegate approves via standing delegation')
    assertEqual(res.json.data.memo.status, 'APPROVED', 'approved via standing delegation')
  })
  await test('approval record identifies both the delegate and who they acted on behalf of', async () => {
    const detail = await call(`/memos/${delegatedMemoId}`, { token: adminAToken })
    const approval = detail.json.data.memo.workflowSteps[0].approvals[0]
    assertEqual(approval.decidedBy.id, employeeAId, 'actor recorded is the delegate')
    assert(approval.reason?.includes('Acting on behalf of'), 'reason clearly names who they acted on behalf of')
  })
  await test('manager revokes the delegation', async () => {
    const list = await call('/delegations', { token: managerAToken })
    const delegationId = list.json.data.given[0].id
    const res = await call(`/delegations/${delegationId}`, { method: 'DELETE', token: managerAToken })
    assertEqual(res.status, 200, 'revoke delegation')
  })

  console.log('\nComments')
  await test('add + list comments', async () => {
    const add = await call(`/comments/${multiStepMemoId}`, { method: 'POST', token: managerAToken, body: { content: 'QA test comment' } })
    assertEqual(add.status, 201, 'add comment')
    const list = await call(`/comments/${multiStepMemoId}`, { token: managerAToken })
    assertEqual(list.status, 200, 'list comments')
    assert(list.json.data.comments.some((c: any) => c.content === 'QA test comment'), 'comment present in list')
  })

  console.log('\nAdmin gating + stats')
  await test('non-admin cannot list org users (403)', async () => {
    const res = await call('/admin/users', { token: employeeAToken })
    assertEqual(res.status, 403, 'non-admin blocked from admin/users')
  })
  await test('admin dashboard totals are sane', async () => {
    const res = await call('/admin/dashboard', { token: adminAToken })
    assertEqual(res.status, 200, 'admin dashboard')
    assertEqual(res.json.data.totalUsers, 3, 'admin + manager + employee = 3 users in org A')
  })
  await test('non-admin can still read the shared /users directory (used for approver pickers)', async () => {
    const res = await call('/users', { token: employeeAToken })
    assertEqual(res.status, 200, 'directory readable by any authenticated user')
  })

  console.log('\nSearch')
  await test('search finds a memo by subject keyword, scoped to caller’s org', async () => {
    const res = await call(`/search?q=${encodeURIComponent(`QA multi-step ${RUN_ID}`)}`, { token: adminAToken })
    assertEqual(res.status, 200, 'search')
    assert(res.json.data.memos.some((m: any) => m.id === multiStepMemoId), 'target memo found')
  })

  console.log('\n\x1b[1mTenant isolation (critical)\x1b[0m')
  await test('org B admin gets 404 fetching an org A memo by id (not leaked as 403)', async () => {
    const res = await call(`/memos/${multiStepMemoId}`, { token: adminBToken })
    assertEqual(res.status, 404, 'cross-tenant memo fetch is 404')
  })
  await test('org B admin cannot approve an org A workflow step', async () => {
    const res = await call(`/workflow/${singleStepMemoId}/approve`, { method: 'POST', token: adminBToken, body: {} })
    assert(res.status === 404 || res.status === 403, `cross-tenant approve blocked (got ${res.status})`)
  })
  await test('org B admin’s user list never contains org A users', async () => {
    const res = await call('/admin/users', { token: adminBToken })
    assertEqual(res.status, 200, 'org B can list its own users')
    const leaked = res.json.data.users.some((u: any) => [ORG_A_ADMIN_EMAIL, managerAEmail, employeeAEmail].includes(u.email))
    assert(!leaked, 'no org A user emails present in org B’s user list')
  })
  await test('org B admin’s search never returns org A memos', async () => {
    const res = await call(`/search?q=QA`, { token: adminBToken })
    assertEqual(res.status, 200, 'org B search')
    const leaked = res.json.data.memos.some((m: any) => [singleStepMemoId, rejectMemoId, changesMemoId, multiStepMemoId, draftMemoId].includes(m.id))
    assert(!leaked, 'no org A memo ids present in org B’s search results')
  })
  await test('org B admin cannot see org A’s departments/categories', async () => {
    const depts = await call('/admin/departments', { token: adminBToken })
    const cats = await call('/admin/categories', { token: adminBToken })
    assert(!depts.json.data.departments.some((d: any) => d.id === deptAId), 'org A department not visible to org B')
    assert(!cats.json.data.categories.some((c: any) => c.id === catAId), 'org A category not visible to org B')
  })

  // -------------------------------------------------------------- report
  console.log('\n' + '─'.repeat(60))
  const passed = results.filter((r) => r.pass).length
  const failed = results.filter((r) => !r.pass)
  console.log(`${passed}/${results.length} passed`)
  if (failed.length) {
    console.log('\nFailures:')
    for (const f of failed) console.log(`  \x1b[31m✗ ${f.name}\x1b[0m — ${f.error}`)
  }
  console.log('─'.repeat(60))
  console.log(`\nFixtures created this run (org A: ${orgAId}, org B: ${orgBId}).`)
  console.log('Not cleaned up automatically — see tests/cleanup.sql or run cleanup out-of-band.\n')

  return failed.length === 0
}

main()
  .then((ok) => process.exit(ok ? 0 : 1))
  .catch((err) => {
    console.error('Suite crashed:', err)
    process.exit(1)
  })
