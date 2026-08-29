# mr.memo

Inter-office memo management system — multi-tenant SaaS for structured internal
approvals with full audit trails. A from-scratch build modeled on the Memobhai
architecture (React + Vite + TypeScript · Vercel Serverless · Supabase · Prisma · Tailwind).

## Tech Stack

| Layer      | Technology                              |
|------------|------------------------------------------|
| Frontend   | React 19 + Vite + TypeScript + Tailwind CSS v4 |
| API        | Vercel Serverless Functions (single router) |
| Auth       | Supabase Auth (JWT sessions)            |
| Database   | Supabase PostgreSQL + Prisma ORM        |
| Storage    | Supabase Storage (attachments)          |
| Hosting    | Vercel                                  |

## Project Structure

```
mr.memo/
├── api/                    # Vercel serverless API (single entry point: index.ts)
│   ├── index.ts             # Router — dispatches all /api/* requests
│   ├── _lib/                 # prisma client, auth/JWT, cors, audit, notify
│   ├── _auth/                # register, login, me, change-password
│   ├── _memos/                # memo CRUD + submit (workflow kickoff)
│   ├── _workflow/              # approve / reject / request-changes / forward
│   ├── _comments/               # comment thread per memo
│   ├── _attachments/             # upload / download / delete
│   ├── _notifications/            # list / mark read
│   ├── _search/                    # full-text-ish search
│   └── _admin/                      # users, departments, categories, org, dashboards
├── prisma/
│   ├── schema.prisma        # 14-model multi-tenant schema
│   └── seed.ts               # demo org + 5 demo users + sample memos
├── frontend/                # React SPA
│   └── src/
│       ├── pages/             # Login, Dashboard, Inbox, MyMemos, CreateMemo, MemoDetail, Search, Profile, admin/*
│       ├── components/         # Layout, ProtectedRoute, WorkflowTimeline, MemoTable, ui kit
│       ├── store/                # Zustand auth store
│       ├── services/              # Axios API client
│       └── lib/                    # Supabase client, types, PDF export
├── vercel.json
└── .env.example
```

## 1. Prerequisites

- Node.js 18+
- A free [Supabase](https://supabase.com) account
- A free [Vercel](https://vercel.com) account (for deployment)

## 2. Set up Supabase

1. Create a new Supabase project.
2. **Project Settings → API** — copy:
   - Project URL
   - `anon` public key
   - `service_role` secret key (never expose this to the frontend)
3. **Project Settings → Database → Connection string** — copy both the pooled
   (port 6543, for `DATABASE_URL`) and direct (port 5432, for `DIRECT_URL`) URIs.
4. **Storage** → create a new **private** bucket named `attachments`.
5. **Authentication → Providers** — Email/Password should be enabled by default.

## 3. Configure environment variables

```bash
cp .env.example .env
```

Fill in every value from step 2. `.env` is gitignored — never commit it.

## 4. Install dependencies

```bash
npm install
```

This installs the root workspace and the `frontend` workspace together.

## 5. Apply the database schema

```bash
npm run db:generate   # generate the Prisma client
npm run db:deploy      # apply prisma/migrations/ (tables, RLS, storage bucket) to Supabase
```

`prisma/migrations/` contains the full history: `20260828000000_init` creates
all 14 tables, `20260828010000_enable_rls_and_storage` enables Row Level
Security and creates the `attachments` storage bucket.

## 6. Seed demo data

```bash
npm run db:seed
```

Creates **Demo Company** with departments (HR, Finance, IT), categories
(Administrative, Financial, Technical), and 5 demo accounts — all password
`Demo123!`:

| Email               | Role  |
|---------------------|-------|
| admin@demo.com      | Admin |
| employee@demo.com   | User  |
| manager@demo.com    | User  |
| finance@demo.com    | User  |
| hr@demo.com         | User  |

Also seeds one fully-approved memo and one memo sitting in `manager@demo.com`'s inbox.

## 7. Run locally

```bash
npm run dev
```

This runs a lightweight local API server (`scripts/dev-server.ts`, port 8081)
and the Vite dev server (frontend, port 8080) concurrently — Vite proxies
`/api/*` requests to the API server. Open **http://localhost:8080**.

> Deployment (not local dev) uses the real Vercel CLI/infrastructure — see
> Section 9 below.

## 8. Demo walkthrough (matches the CSE226 demo scenario)

1. Log in as `employee@demo.com` → **Create Memo** → fill subject/body → add
   approvers `manager@demo.com` then `finance@demo.com` → Submit.
2. Log out, log in as `manager@demo.com` → **Inbox** → open the memo → Approve.
3. Log in as `finance@demo.com` → Approve (final step) → memo status becomes **Approved**.
4. Log back in as `employee@demo.com` → see full workflow history + PDF export.
5. Log in as `admin@demo.com` → **Admin** → manage users/departments/categories,
   view org dashboard.
6. Use **Search** to filter by status/department/priority.
7. Confirm tenant isolation: register a second organization via `/register` —
   its users/memos are fully invisible to Demo Company and vice versa.

## 9. Deploy to Vercel

```bash
vercel link
```

Then in the Vercel dashboard, add every variable from `.env` under
**Settings → Environment Variables** (Production + Preview + Development), and
set `FRONTEND_URL` to your deployed domain. Push to your connected Git branch,
or run:

```bash
vercel --prod
```

Run `npm run db:push` and `npm run db:seed` once against the production
database (point `.env` at the prod Supabase project temporarily, or use
`vercel env pull`).

## Architecture notes

- **Multi-tenancy**: every table carries `organizationId`; every query in
  `api/_lib/auth.ts` → `requireAuth()` resolves the caller's org from their
  Supabase JWT, and all handlers filter by it. No cross-tenant query paths exist.
- **Single serverless function**: all `/api/*` traffic is routed through one
  `api/index.ts` entry point (see `vercel.json` rewrites) to stay well under
  Vercel's per-plan function-count limits — internal routing is plain
  function dispatch, not separate deployments.
- **Workflow engine**: `WorkflowStep` rows are ordered by `position`;
  `Memo.currentStepIndex` tracks progress. Approve/reject/request-changes/forward
  all run inside a Prisma transaction that updates the step, records an
  `Approval`, and advances (or terminates) the memo.
- **Audit trail**: every mutating action calls `logAudit()`, writing an
  immutable `AuditLog` row (event type, actor, entity, description).

