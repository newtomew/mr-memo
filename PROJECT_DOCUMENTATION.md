# mr.memo — Project Documentation

**CSE226 — Foundations of Vibe Coding — Summer 2026**
**Inter-Office Memo Management System**

---

## 26.1 System Overview

**mr.memo** is a multi-tenant, web-based inter-office memo management system.
Organizations create memos, route them through a sequential chain of
reviewers, and track every action — approve, reject, comment, request
changes — from submission to final disposition. Each organization's users,
memos, departments, and workflows are strictly isolated from every other
organization on the same deployment.

Core functionality implemented:

- Multi-tenant organization management (self-service signup creates a new org)
- Email/password authentication via Supabase Auth, including password reset
- Two roles: Organization Administrator and Regular User, enforced server-side
- Memo lifecycle: draft → submit → sequential review → approved / rejected / changes-requested → resubmit
- A configurable, ordered approval workflow with delegation ("forward")
- Reusable workflow templates
- Comments, file attachments, in-app notifications
- Full-text-ish search with tenant-scoped results
- Personal and organization-wide dashboards, including basic reporting
- PDF export of a memo's full record
- An immutable audit log, viewable by admins
- A full automated integration test suite (40 assertions) exercising every
  workflow path and, specifically, cross-tenant isolation

## 26.2 Requirements Implemented

The system was built directly against the CSE226 specification
(`CSE226_Summer_26_Project-3.pdf`), section by section. A full, verified
requirement-by-requirement compliance ledger — including the handful of
items that remain partial or unimplemented, and why — is maintained
separately; see **Known Limitations (§26.9)** below for the summary, and the
compliance report generated during development for the exhaustive
section-by-section breakdown.

In short: all "Must"-level functional requirements from spec sections 1–14
and 18, 21, 22, and 25 are implemented and verified (both by automated tests
and manual use). Spec sections 15–17, 19, and 20 are implemented at varying
levels of completeness — see §26.9.

## 26.3 Technology Stack

| Layer | Technology |
|---|---|
| Language | TypeScript throughout (frontend and backend) |
| Frontend framework | React 19 + Vite + Tailwind CSS v4 |
| Backend | Vercel Serverless Functions — single router (`api/index.ts`) dispatching to modular handlers |
| Database | PostgreSQL, hosted on Supabase |
| ORM | Prisma (schema-first, migration-tracked) |
| Authentication | Supabase Auth (JWT sessions, email/password, password reset) |
| File storage | Supabase Storage (private bucket, signed URLs) |
| Hosting / deployment | Vercel |
| AI / vibe-coding tool | Claude Code (Anthropic), used for the entire build |

## 26.4 System Architecture

```
┌─────────────┐        ┌──────────────────────┐        ┌────────────────────┐
│  React SPA  │──HTTP─▶│  Vercel Serverless    │──SQL──▶│  Supabase Postgres  │
│  (Vite)     │        │  Function (api/index) │        │  (via Prisma)       │
└─────────────┘        └──────────┬───────────┘        └────────────────────┘
       │                          │
       │ Supabase Auth SDK        │ Supabase Admin SDK
       ▼                          ▼
┌─────────────────────────────────────────────┐
│              Supabase Auth (JWT)             │
└─────────────────────────────────────────────┘
                                    │
                                    ▼
                        ┌─────────────────────┐
                        │  Supabase Storage    │
                        │  (attachments, RLS)  │
                        └─────────────────────┘
```

**Frontend** — a single-page React app. It authenticates directly against
Supabase Auth (for login/password-reset only) and calls the application's
own REST-style API for every other operation, sending the Supabase-issued
JWT as a Bearer token.

**Backend** — a single Vercel serverless function (`api/index.ts`) that
manually routes every `/api/*` request to a handler module by path and
method (`api/_auth`, `api/_memos`, `api/_workflow`, `api/_comments`,
`api/_attachments`, `api/_notifications`, `api/_search`, `api/_admin`). This
keeps the deployment under Vercel's per-plan serverless function count
limit while still keeping the code itself modular.

**Database** — a single shared Postgres instance. Every application table
carries an `organizationId` column; every query in the API layer filters by
the caller's `organizationId`, resolved from their JWT on every request (see
`api/_lib/auth.ts` → `requireAuth()`). Row Level Security is additionally
enabled on every table as defense-in-depth against the (unused, in this
architecture) direct PostgREST path.

**File storage** — attachments are stored in a private Supabase Storage
bucket. Files are never served by a public URL; the API generates a
60-second signed URL per download request after verifying the caller has
access to the owning memo.

## 26.5 Database Design

Fourteen tables, defined in `prisma/schema.prisma`:

- **Organization** — tenant root (name, slug, logo, contact)
- **Department**, **MemoCategory** — org-scoped lookup tables
- **User** — profile row linked 1:1 to a Supabase `auth.users` row via `authId`
- **Memo** — the core entity: subject, body, priority, status, author, current step index
- **WorkflowStep** — one row per position in a memo's approval chain (ordered by `position`)
- **Approval** — an immutable record of each decision made on a step (approve/reject/changes/forward)
- **Comment** — threaded discussion on a memo, typed (general/approval/rejection/change-request)
- **Attachment** — file metadata; the file itself lives in Supabase Storage
- **MemoVersion** — a snapshot of a memo's content, captured whenever it's edited after being returned for changes
- **Notification** — in-app alerts per user
- **WorkflowTemplate** — reusable, named approval-chain definitions
- **Delegation** — schema present for time-bound delegation (see §26.9 — not yet wired to an API)
- **AuditLog** — immutable event log

**Multi-tenancy** is implemented at the row level, not via separate schemas
or databases: every tenant-owned table has a non-nullable `organizationId`
foreign key, and **every** query issued by the API includes it in the
`WHERE` clause. There is no code path in the application that queries
across organizations. This was verified with five dedicated automated tests
that create two separate organizations and assert that neither can read,
search, or act on the other's data (see `tests/api.integration.ts`).

## 26.6 Workflow Design

A memo's approval workflow is a strictly ordered list of `WorkflowStep`
rows (`position` 0, 1, 2, …), each pointing at the `User` responsible for
that step. `Memo.currentStepIndex` tracks which position is currently
active.

- **Submit**: the author supplies an ordered list of approvers; the API
  creates one `WorkflowStep` per entry and sets `currentStepIndex = 0`.
- **Approve**: only the user at the current step (or their delegate — see
  Forward, below) may act. The step is marked `APPROVED`, an `Approval`
  record is written, and `currentStepIndex` advances. If it was the last
  step, the memo becomes `APPROVED` and the author is notified; otherwise
  the next approver is notified.
- **Reject**: terminates the workflow immediately; the memo becomes
  `REJECTED`. A reason is required.
- **Request Changes**: returns the memo to `CHANGES_REQUESTED`. The author
  can then edit it — which snapshots the pre-edit content into
  `MemoVersion` — and resubmit, which clears the old `WorkflowStep` rows
  and creates a fresh chain, restarting at position 0.
- **Forward**: the current step's user may reassign just that one step to
  another user (`WorkflowStep.delegatedToId`); the delegate can then act in
  their place, and the resulting `Approval` record is attributed to the
  actual actor.
- **Standing delegation** (spec §16 — distinct from Forward): a user can
  create a `Delegation` row naming another user, a start date, and an end
  date. While that range covers "now," the delegate can act on *any* of the
  delegating user's pending workflow steps, not just one memo. Authorization
  checks the direct approver match first, then falls back to an active
  delegation. Every `Approval` produced this way has its `reason` prefixed
  with `"[Acting on behalf of <name>]"` so the record clearly identifies
  both the delegate (via `decidedById`) and who they acted for.

Every one of these transitions runs inside a single Prisma
`$transaction()` so a step update, its `Approval` record, and the memo's
new status/index are committed atomically.

## 26.7 Security

- **Authentication**: delegated entirely to Supabase Auth. Passwords are
  never touched or stored by application code — Supabase handles hashing.
  Sessions are stateless JWTs.
- **Authorization**: enforced server-side on every mutating endpoint, never
  by hiding UI elements. `requireAuth()` resolves the caller's identity and
  organization from their JWT on every request; `requireAdmin()` gates
  admin-only routes; ownership and current-approver checks are explicit
  `if` statements in each handler (e.g. "you are not the current
  approver" → 403). This is exercised by dozens of automated 401/403 tests.
- **Tenant isolation**: every query is scoped by `organizationId`. A
  cross-tenant lookup returns 404, not 403, to avoid confirming that a
  resource exists in another org. Verified by dedicated automated tests.
- **File security**: attachments live in a private bucket; access is only
  ever granted via a signed URL generated after an authorization check, and
  the URL expires in 60 seconds. Upload is restricted by MIME-type
  allowlist and a 10MB size cap.
- **Password security**: fully delegated to Supabase Auth; the app never
  sees or stores a plaintext or reversibly-encrypted password.
- **Input validation**: every API handler validates its input with a Zod
  schema before touching the database.
- **Row Level Security**: enabled on all 14 tables in Postgres as a second
  layer of defense — even though the app's own access path (Prisma with a
  service-role key) bypasses RLS, this closes off the direct PostgREST/anon
  path that Supabase otherwise exposes by default.
- **Known trade-off**: the JWT is stored in `localStorage` on the frontend
  for simplicity, which carries a theoretical XSS-exfiltration risk
  compared to an httpOnly cookie. Documented here as a deliberate MVP
  trade-off rather than an oversight.

## 26.8 Vibe-Coding Process

**AI tool used**: Claude Code (Anthropic), used for the entirety of this
project's design and implementation, in a single continuous session.

**How requirements were communicated**: the student provided the three
Memobhai reference documents (a build guide, a user guide, and a PRD
mapping the CSE226 spec to numbered requirements MR-001–MR-050) and asked
for a from-scratch rebuild under the new name "mr.memo." Requirements were
also cross-checked directly against the original CSE226 specification PDF
later in the process, once it was made available, to close gaps the
summarized PRD had missed.

**How generated code was evaluated**: not by inspection alone. At each
major milestone the code was actually run — a local dev server was stood
up against a real (not mocked) Supabase project, and functionality was
verified end-to-end: first by direct HTTP calls, then by driving the
actual React UI in a browser and observing real state changes (login,
memo creation, multi-step approval, rejection, notifications, admin
panel). A 40-assertion automated integration test suite was written and
run against the live API for regression coverage, covering every workflow
path and — specifically — multi-tenant isolation.

**How errors were identified and corrected**: several real bugs were found
this way, not by code review:

- A React state race condition in the memo detail page, where an
  out-of-order network response could clobber a fresher one after a
  workflow action — caught by manually clicking through the Approve flow
  in a browser and noticing the UI silently reverted, confirmed by
  checking the database directly (data was correct; only the UI was
  stale). Fixed with a request-sequence guard.
- A Vercel CLI recursion/auto-detection issue that broke local `vercel
  dev` — diagnosed by reading the actual error message chain rather than
  guessing, and resolved by replacing `vercel dev` for local API serving
  with a small dedicated dev server that runs the real production handler
  code directly.
- A Prisma + Supabase PgBouncer connection-pool exhaustion bug, where
  running two independent `PrismaClient` instances (the dev server's own,
  plus a second one opened by the test script) against Supabase's
  free-tier pooler caused interactive `$transaction()` calls to hang
  indefinitely. Diagnosed by observing that the *database itself* was
  fine (a `curl` to an unrelated endpoint kept responding) while one
  specific in-flight request never returned, then confirming empirically
  that every write from the "successful" test run had in fact never
  committed. Fixed by capping the connection pool size and removing the
  redundant client.

**How the student verified the system actually satisfies the
requirements**: by re-reading the original specification PDF in full
(not the summarized PRD) after the initial build, and cross-checking every
one of its 31 sections against the actual code — via `grep` and direct file
reads, not memory or assumption — to produce a verified compliance report,
which then drove a second pass of implementation work to close the gaps it
surfaced (workflow templates, delegation-adjacent forwarding, audit log
viewer, self-service profile editing, forgot-password flow, PDF export
completeness, reporting by department/category and average completion
time, and more).

## 26.8b Extended Features (Post-Submission, Beyond CSE226 Scope)

After the graded CSE226 deliverable was complete, the following features
were added at the project owner's request. They sit on top of the same
multi-tenant architecture described above and are covered by the
integration suite (§26.8).

- **Performance**: Vercel functions were pinned to the `hnd1` (Tokyo)
  region to co-locate compute with the Supabase database
  (`ap-northeast-1`), and the frontend moved to route-level code splitting
  (`React.lazy` per page, dynamic `import()` for the PDF-export library),
  cutting the initial bundle from ~1.1MB to under 500KB.
- **Notifications**: the existing in-app notification bell now also
  covers org-wide "new memo submitted" broadcasts to Admins/Managers, and
  a daily Vercel Cron job (`api/_cron/handlers.ts`, `vercel.json` →
  `crons`) escalates memos stuck awaiting approval — Managers/Admins are
  notified past 2 days, the memo's author past 5 days.
- **Messaging**: a lightweight 1:1 inbox (`api/_messages`,
  `frontend/src/pages/Messages.tsx`) lets any two members of the same
  organization exchange direct messages, tenant-scoped like everything
  else.
- **Profile management**: users can upload a profile picture (Supabase
  Storage, public `avatars` bucket) and change their login email
  (`PUT /api/auth/email`) from Settings, alongside the pre-existing
  authenticated change-password flow.
- **Differentiated signup + approval gating**: joining an *existing*
  organization now requires choosing Manager or Employee and goes through
  a `JoinRequest` approval step — Employee requests are reviewed by that
  org's own Admins/Managers, Manager requests by a platform administrator.
  Creating a brand-new organization (the original flow) is untouched and
  stays instant. New-org tenant isolation is covered by a dedicated
  mid-session regression test.
- **Platform administration**: a separate, top-level admin identity
  (`PlatformAdmin` — no Organization/User row, its own auth path at
  `/platform/login`) can browse every organization that has signed up,
  drill into its Managers/Employees/memos/activity log, and ban/unban any
  organization, user, or memo. Three placeholder platform-admin accounts
  were seeded via `scripts/seed-platform-admins.ts` for the owner to
  reassign.

A serious pre-existing bug was also found and fixed during this work: the
login handler called `signInWithPassword()` directly on the shared
service-role Supabase client, which silently overwrites that client's
session to whatever end user last logged in — breaking every subsequent
service-role Storage/Admin call (file uploads included) for the rest of
the server process's life. Login now uses a disposable client instead
(`freshAuthClient()` in `api/_lib/auth.ts`).

## 26.9 Known Limitations

- **Rich-text memo body (spec §3.1)**: the memo body is plain text, not
  rich text. The spec marks this as a "should," not a "shall."
- **Email notifications**: not implemented. The spec marks this as
  optional ("may additionally support"); only in-app notifications exist.
- **Password OTP**: password reset uses a Supabase magic link sent to the
  user's email rather than a numeric one-time code, since delivering a
  numeric code requires customizing the Supabase project's email template
  (a dashboard-only setting outside API/MCP reach). The change-password
  flow inside Profile settings (authenticated, no email round-trip) is
  unaffected and remains available.
- No dedicated unit-test suite exists for individual functions — test
  coverage is black-box integration testing against the real running API
  and a real database, which was judged more valuable for this project's
  size than mocked unit tests, but means there's no fast, isolated test
  for e.g. a single validation function.

## 26.10 Deployment Information

- **Live System**: [https://mr-memo.vercel.app](https://mr-memo.vercel.app) — demo credentials: `admin@demo.com` / `Demo123!` (also `employee@demo.com`, `manager@demo.com`, `finance@demo.com`, `hr@demo.com`, all same password)
- **Source Code ZIP**: [https://github.com/newtomew/mr-memo/archive/refs/heads/main.zip](https://github.com/newtomew/mr-memo/archive/refs/heads/main.zip) — GitHub's auto-generated archive of the `main` branch, always in sync with the deployed commit, contains the complete source tree including `prisma/migrations`
- **Installation Instructions**: see [`README.md`](./README.md) in this
  repository — covers prerequisites, Supabase setup, environment
  configuration, database migration, seeding, local run, and production
  build.

## 27.1 AI Prompt and Response History

**AI Prompt/Response History URL**: [https://gist.github.com/newtomew/1ebef242d4d914c933766baccd4cdf31](https://gist.github.com/newtomew/1ebef242d4d914c933766baccd4cdf31)

This is the complete, unabridged Claude Code session transcript (raw
exported JSONL, one line per event, chronological) that built this
project end-to-end — not a summary. Per §27's explicit allowance,
credentials that appeared in the raw transcript (Postgres connection
strings, Supabase JWTs/API keys, generated platform-admin passwords) were
redacted in place with `[REDACTED-...]` markers before upload; every
prompt, response, tool call, debugging step, and correction is otherwise
preserved verbatim and in order.

---

*This document was drafted alongside the implementation, in the same
Claude Code session that built the system, as part of satisfying CSE226
submission requirement §26.*
