import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import crypto from 'node:crypto'
import { getCollections } from '@/lib/db/mongodb'
import { jsonError, requireCsrf } from '@/lib/security/api-guard'
import { getCurrentSession, toPublicUser } from '@/lib/security/session'
import { getRequestContext } from '@/lib/security/request-context'
import { logAuditEvent } from '@/lib/security/audit'
import { enforcePostResetProbation } from '@/lib/recovery/probation'
import { resolveResetMode } from '@/lib/recovery/config'

const AccountSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('change-email'),
    newEmail: z.string().trim().email('Valid email is required'),
  }),
  z.object({
    action: z.literal('add-backup-channel'),
    backupEmail: z.string().trim().email('Valid backup email is required'),
  }),
  z.object({
    action: z.literal('clear-flag'),
  }),
])

export async function POST(req: NextRequest) {
  const csrfError = requireCsrf(req)
  if (csrfError) return csrfError

  const current = await getCurrentSession()
  if (!current) return jsonError('Authentication required.', 401)

  const context = getRequestContext(req)
  const mode = resolveResetMode(req)
  const { users } = await getCollections()
  const { user, session } = current

  try {
    const body = await req.json()
    const parsed = AccountSchema.safeParse(body)
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message || 'Invalid account update.', 400)
    }

    const data = parsed.data
    if (data.action === 'change-email' || data.action === 'add-backup-channel') {
      const probation = await enforcePostResetProbation({
        user,
        action: data.action === 'change-email' ? 'change_email' : 'change_recovery_settings',
        context,
        mode,
        sessionCreatedAt: session.createdAt,
      })
      if (!probation.allowed) {
        return jsonError(probation.message!, 403, {
          code: 'PROBATION_ACTIVE',
          unlocksAt: probation.unlocksAt,
        })
      }
    }

    const now = new Date()

    if (data.action === 'change-email') {
      const nextEmail = data.newEmail.toLowerCase()
      const conflict = await users.findOne({ email: nextEmail, _id: { $ne: user._id } })
      if (conflict) return jsonError('Email is already in use.', 409)

      const channels = (user.confirmedChannels || []).filter((c) => c.type !== 'email')
      channels.unshift({
        id: crypto.randomUUID(),
        type: 'email',
        value: nextEmail,
        verified: true,
        addedAt: now,
      })

      await users.updateOne(
        { _id: user._id },
        {
          $set: {
            email: nextEmail,
            confirmedChannels: channels,
            lastSecurityChangeAt: now,
            updatedAt: now,
          },
        }
      )
      await logAuditEvent({
        eventType: 'ACCOUNT_EMAIL_CHANGED',
        severity: 'warning',
        blocked: false,
        email: nextEmail,
        userId: user._id!,
        context,
      })
      const updated = await users.findOne({ _id: user._id })
      return NextResponse.json({ ok: true, user: updated ? toPublicUser(updated) : null })
    }

    if (data.action === 'add-backup-channel') {
      const backup = data.backupEmail.toLowerCase()
      const channels = [...(user.confirmedChannels || [])]
      if (!channels.some((c) => c.value === backup)) {
        channels.push({
          id: crypto.randomUUID(),
          type: 'backup_email',
          value: backup,
          verified: true,
          addedAt: now,
        })
      }
      await users.updateOne(
        { _id: user._id },
        { $set: { confirmedChannels: channels, updatedAt: now } }
      )
      await logAuditEvent({
        eventType: 'BACKUP_CHANNEL_ADDED',
        severity: 'info',
        blocked: false,
        email: user.email,
        userId: user._id!,
        context,
      })
      const updated = await users.findOne({ _id: user._id })
      return NextResponse.json({ ok: true, user: updated ? toPublicUser(updated) : null })
    }

    if (data.action === 'clear-flag') {
      await users.updateOne(
        { _id: user._id },
        { $set: { flaggedSuspicious: false, flaggedReason: null, updatedAt: now } }
      )
      const updated = await users.findOne({ _id: user._id })
      return NextResponse.json({ ok: true, user: updated ? toPublicUser(updated) : null })
    }

    return jsonError('Unsupported action.', 400)
  } catch (err) {
    console.error('Account update error:', err)
    return jsonError('Failed to update account.', 500)
  }
}
