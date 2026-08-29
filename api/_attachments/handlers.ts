import type { VercelRequest, VercelResponse } from '@vercel/node'
import { z } from 'zod'
import { randomUUID } from 'crypto'
import { prisma } from '../_lib/prisma'
import { requireAuth, supabaseAdmin } from '../_lib/auth'
import { ok, fail, handleError, ApiError } from '../_lib/response'
import { logAudit } from '../_lib/audit'

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'attachments'
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const ALLOWED_MIME_PREFIXES = ['image/', 'application/pdf', 'application/msword', 'application/vnd', 'text/plain']

const uploadSchema = z.object({
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  base64Data: z.string().min(1),
})

/** POST /api/attachments/:memoId — accepts a base64-encoded file */
export async function uploadAttachment(req: VercelRequest, res: VercelResponse, memoId: string) {
  try {
    const ctx = await requireAuth(req)
    const body = uploadSchema.parse(req.body)

    const memo = await prisma.memo.findFirst({ where: { id: memoId, organizationId: ctx.organizationId } })
    if (!memo) throw new ApiError(404, 'Memo not found')

    const isAllowedType = ALLOWED_MIME_PREFIXES.some((p) => body.mimeType.startsWith(p))
    if (!isAllowedType) throw new ApiError(400, 'File type not allowed')

    const buffer = Buffer.from(body.base64Data, 'base64')
    if (buffer.byteLength > MAX_FILE_SIZE) throw new ApiError(400, 'File exceeds the 10MB limit')

    const storageKey = `${ctx.organizationId}/${memoId}/${randomUUID()}-${body.fileName}`
    const { error: uploadError } = await supabaseAdmin.storage.from(BUCKET).upload(storageKey, buffer, {
      contentType: body.mimeType,
      upsert: false,
    })
    if (uploadError) throw new ApiError(500, `Upload failed: ${uploadError.message}`)

    const attachment = await prisma.attachment.create({
      data: {
        organizationId: ctx.organizationId,
        memoId,
        uploadedById: ctx.user.id,
        fileName: body.fileName,
        fileSize: buffer.byteLength,
        mimeType: body.mimeType,
        storageKey,
      },
      include: { uploadedBy: { select: { id: true, name: true } } },
    })

    await logAudit({
      organizationId: ctx.organizationId,
      userId: ctx.user.id,
      eventType: 'attachment.uploaded',
      entityType: 'Memo',
      entityId: memoId,
      description: `${ctx.user.name} attached "${body.fileName}" to memo "${memo.subject}"`,
    })

    return ok(res, { attachment }, 201)
  } catch (err) {
    if (err instanceof z.ZodError) return fail(res, 400, err.errors[0]?.message || 'Invalid input')
    return handleError(res, err)
  }
}

/** GET /api/attachments/download/:id — returns a short-lived signed URL */
export async function downloadAttachment(req: VercelRequest, res: VercelResponse, attachmentId: string) {
  try {
    const ctx = await requireAuth(req)
    const attachment = await prisma.attachment.findFirst({
      where: { id: attachmentId, organizationId: ctx.organizationId },
    })
    if (!attachment) throw new ApiError(404, 'Attachment not found')

    const { data, error } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(attachment.storageKey, 60) // 60 seconds
    if (error || !data) throw new ApiError(500, 'Failed to generate download link')

    return ok(res, { url: data.signedUrl, fileName: attachment.fileName })
  } catch (err) {
    return handleError(res, err)
  }
}

/** DELETE /api/attachments/:id */
export async function deleteAttachment(req: VercelRequest, res: VercelResponse, attachmentId: string) {
  try {
    const ctx = await requireAuth(req)
    const attachment = await prisma.attachment.findFirst({
      where: { id: attachmentId, organizationId: ctx.organizationId },
    })
    if (!attachment) throw new ApiError(404, 'Attachment not found')
    if (attachment.uploadedById !== ctx.user.id && ctx.user.role !== 'ADMIN') {
      throw new ApiError(403, 'Only the uploader or an admin can delete this attachment')
    }

    await supabaseAdmin.storage.from(BUCKET).remove([attachment.storageKey])
    await prisma.attachment.delete({ where: { id: attachmentId } })

    await logAudit({
      organizationId: ctx.organizationId,
      userId: ctx.user.id,
      eventType: 'attachment.deleted',
      entityType: 'Memo',
      entityId: attachment.memoId,
      description: `${ctx.user.name} deleted attachment "${attachment.fileName}"`,
    })

    return ok(res, { message: 'Attachment deleted' })
  } catch (err) {
    return handleError(res, err)
  }
}
