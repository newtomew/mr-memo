import type { VercelResponse } from '@vercel/node'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export function ok(res: VercelResponse, data: unknown, status = 200) {
  return res.status(status).json({ success: true, data })
}

export function fail(res: VercelResponse, status: number, message: string) {
  return res.status(status).json({ success: false, error: message })
}

export function handleError(res: VercelResponse, err: unknown) {
  if (err instanceof ApiError) {
    return fail(res, err.status, err.message)
  }
  console.error('Unhandled API error:', err)
  return fail(res, 500, 'Internal server error')
}
