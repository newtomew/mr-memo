import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { PrismaClient } from '@prisma/client'
import { randomBytes } from 'crypto'

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
})
const prisma = new PrismaClient()

function genPassword() {
  return randomBytes(9).toString('base64').replace(/[+/=]/g, 'x') + 'A1!'
}

const admins = [
  { email: 'platform-admin1@mrmemo.app', name: 'Platform Admin One' },
  { email: 'platform-admin2@mrmemo.app', name: 'Platform Admin Two' },
  { email: 'platform-admin3@mrmemo.app', name: 'Platform Admin Three' },
]

async function main() {
  const results: { email: string; password: string }[] = []
  for (const a of admins) {
    const existing = await prisma.platformAdmin.findUnique({ where: { email: a.email } })
    if (existing) {
      console.log(`SKIP (already exists): ${a.email}`)
      continue
    }
    const password = genPassword()
    const { data, error } = await supabase.auth.admin.createUser({
      email: a.email,
      password,
      email_confirm: true,
    })
    if (error || !data.user) {
      console.error(`FAILED to create auth user for ${a.email}:`, error?.message)
      continue
    }
    await prisma.platformAdmin.create({
      data: { authId: data.user.id, email: a.email, name: a.name },
    })
    results.push({ email: a.email, password })
  }

  console.log('\n=== Platform Admin Credentials (save these now — shown once) ===')
  for (const r of results) {
    console.log(`${r.email}  /  ${r.password}`)
  }
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
