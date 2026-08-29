import type { VercelRequest, VercelResponse } from '@vercel/node'

export function applyCors(req: VercelRequest, res: VercelResponse): boolean {
  const origin = process.env.FRONTEND_URL || '*'
  res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Access-Control-Allow-Credentials', 'true')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return true // caller should stop processing
  }
  return false
}
