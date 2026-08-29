import type { VercelRequest, VercelResponse } from '@vercel/node'
import { z } from 'zod'
import { prisma } from '../_lib/prisma'
import { requireAuth } from '../_lib/auth'
import { ok, fail, handleError, ApiError } from '../_lib/response'
import { notify } from '../_lib/notify'

/**
 * GET /api/messages — one row per person the caller has ever exchanged
 * messages with, most-recent first, with unread count. This is the
 * Messenger-style inbox list.
 */
export async function listConversations(req: VercelRequest, res: VercelResponse) {
  try {
    const ctx = await requireAuth(req)

    const rows = await prisma.message.findMany({
      where: {
        organizationId: ctx.organizationId,
        OR: [{ senderId: ctx.user.id }, { recipientId: ctx.user.id }],
      },
      orderBy: { createdAt: 'desc' },
      include: {
        sender: { select: { id: true, name: true, avatarUrl: true, role: true } },
        recipient: { select: { id: true, name: true, avatarUrl: true, role: true } },
      },
    })

    const byPeer = new Map<string, { peer: any; lastMessage: (typeof rows)[number]; unread: number }>()
    for (const m of rows) {
      const peer = m.senderId === ctx.user.id ? m.recipient : m.sender
      const existing = byPeer.get(peer.id)
      const isUnreadForMe = m.recipientId === ctx.user.id && !m.read
      if (!existing) {
        byPeer.set(peer.id, { peer, lastMessage: m, unread: isUnreadForMe ? 1 : 0 })
      } else if (isUnreadForMe) {
        existing.unread += 1
      }
    }

    return ok(res, { conversations: Array.from(byPeer.values()) })
  } catch (err) {
    return handleError(res, err)
  }
}

/** GET /api/messages/:userId — full thread with one other org member */
export async function getThread(req: VercelRequest, res: VercelResponse, otherUserId: string) {
  try {
    const ctx = await requireAuth(req)

    const otherUser = await prisma.user.findFirst({
      where: { id: otherUserId, organizationId: ctx.organizationId },
      select: { id: true, name: true, avatarUrl: true, role: true },
    })
    if (!otherUser) throw new ApiError(404, 'User not found')

    const messages = await prisma.message.findMany({
      where: {
        organizationId: ctx.organizationId,
        OR: [
          { senderId: ctx.user.id, recipientId: otherUserId },
          { senderId: otherUserId, recipientId: ctx.user.id },
        ],
      },
      orderBy: { createdAt: 'asc' },
    })

    await prisma.message.updateMany({
      where: { organizationId: ctx.organizationId, senderId: otherUserId, recipientId: ctx.user.id, read: false },
      data: { read: true },
    })

    return ok(res, { otherUser, messages })
  } catch (err) {
    return handleError(res, err)
  }
}

const sendMessageSchema = z.object({
  recipientId: z.string().min(1),
  content: z.string().min(1).max(4000),
})

/** POST /api/messages — send a 1:1 message to another member of the same org */
export async function sendMessage(req: VercelRequest, res: VercelResponse) {
  try {
    const ctx = await requireAuth(req)
    const body = sendMessageSchema.parse(req.body)

    if (body.recipientId === ctx.user.id) throw new ApiError(400, "You can't message yourself")

    const recipient = await prisma.user.findFirst({
      where: { id: body.recipientId, organizationId: ctx.organizationId, status: 'ACTIVE' },
    })
    if (!recipient) throw new ApiError(404, 'Recipient not found')

    const message = await prisma.message.create({
      data: {
        organizationId: ctx.organizationId,
        senderId: ctx.user.id,
        recipientId: recipient.id,
        content: body.content,
      },
    })

    await notify({
      organizationId: ctx.organizationId,
      userId: recipient.id,
      type: 'NEW_MESSAGE',
      message: `${ctx.user.name} sent you a message`,
    })

    return ok(res, { message }, 201)
  } catch (err) {
    if (err instanceof z.ZodError) return fail(res, 400, err.errors[0]?.message || 'Invalid input')
    return handleError(res, err)
  }
}
