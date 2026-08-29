// Minimal local stand-in for `vercel dev` — runs our actual api/index.ts
// handler over plain Node http, without Vercel CLI's monorepo/devCommand
// auto-detection getting in the way. Production deploys use Vercel's real
// infrastructure and never touch this file.
import 'dotenv/config'
import http from 'node:http'
import { URL } from 'node:url'
import handler from '../api/index'
import { prisma } from '../api/_lib/prisma'

const PORT = process.env.API_PORT ? Number(process.env.API_PORT) : 8081

const server = http.createServer(async (req, res) => {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  const rawBody = Buffer.concat(chunks).toString('utf8')

  let body: unknown
  const contentType = req.headers['content-type'] || ''
  if (rawBody && contentType.includes('application/json')) {
    try {
      body = JSON.parse(rawBody)
    } catch {
      body = rawBody
    }
  } else if (rawBody) {
    body = rawBody
  }

  const url = new URL(req.url || '/', `http://${req.headers.host}`)
  const query: Record<string, string> = {}
  url.searchParams.forEach((v, k) => {
    query[k] = v
  })

  const vercelReq = req as any
  vercelReq.body = body
  vercelReq.query = query
  vercelReq.cookies = {}

  const vercelRes = res as any
  vercelRes.status = (code: number) => {
    res.statusCode = code
    return vercelRes
  }
  vercelRes.json = (data: unknown) => {
    if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(data))
    return vercelRes
  }
  vercelRes.send = (data: unknown) => {
    res.end(data as any)
    return vercelRes
  }

  try {
    await handler(vercelReq, vercelRes)
  } catch (err) {
    console.error('[dev-server] handler error:', err)
    if (!res.headersSent) {
      res.statusCode = 500
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ success: false, error: 'Internal server error' }))
    }
  }
})

// Establish the Prisma connection pool before accepting traffic — starting
// to listen first let the very first request or two race a cold-start
// "Can't reach database server" error while the pool was still warming up.
prisma
  .$connect()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`[dev-server] API ready at http://localhost:${PORT}/api`)
    })
  })
  .catch((err) => {
    console.error('[dev-server] Failed to connect to the database:', err)
    process.exit(1)
  })
