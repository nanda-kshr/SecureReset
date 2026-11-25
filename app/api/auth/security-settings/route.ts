import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getCollections } from '@/lib/db/mongodb'
import { jsonError, requireCsrf } from '@/lib/security/api-guard'
import { hashPassword, sha256 } from '@/lib/security/crypto'
import { getCurrentSession, SESSION_COOKIE_NAME, toPublicUser } from '@/lib/security/session'
import { generateTotpEnrollment, verifyTotpCode } from '@/lib/security/totp'
import { getRequestContext } from '@/lib/security/request-context'
import { logAuditEvent } from '@/lib/security/audit'
import { enforcePostResetProbation } from '@/lib/recovery/probation'
import { resolveResetMode } from '@/lib/recovery/config'

const SettingsSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('setup-totp') }),
  z.object({ action: z.literal('confirm-totp'), code: z.string().min(6).max(8) }),
  z.object({ action: z.literal('disable-totp'), code: z.string().min(6).max(8) }),
  z.object({
    action: z.literal('set-security-question'),
    question: z.string().trim().min(5).max(160),
    answer: z.string().trim().min(2).max(120),
  }),
  z.object({ action: z.literal('toggle-passkey'), enabled: z.boolean() }),
  z.object({ action: z.literal('revoke-other-sessions') }),
])

export async function POST(req: NextRequest) {
  const csrfError = requireCsrf(req)
  if (csrfError) return csrfError

  const current = await getCurrentSession()
  if (!current) {
    return jsonError('Authentication required.', 401)
  }

  const context = getRequestContext(req)
  const mode = resolveResetMode(req)
  const { users, sessions } = await getCollections()
  const { user, session } = current

  try {
    const body = await req.json()
    const parsed = SettingsSchema.safeParse(body)
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message || 'Invalid security setting payload', 400)
    }

    const data = parsed.data

    if (
      data.action === 'setup-totp' ||
      data.action === 'confirm-totp' ||
      data.action === 'disable-totp' ||
      data.action === 'set-security-question' ||
      data.action === 'toggle-passkey'
    ) {
      const probationAction =
        data.action === 'set-security-question'
          ? 'change_recovery_settings'
          : data.action === 'toggle-passkey'
            ? 'add_trusted_key_or_passkey'
            : 'change_mfa'

      const probation = await enforcePostResetProbation({
        user,
        action: probationAction,
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

    if (data.action === 'setup-totp') {
      const enrollment = await generateTotpEnrollment(user.email)
      await users.updateOne(
        { _id: user._id },
        { $set: { totpPendingSecret: enrollment.base32, updatedAt: new Date() } }
      )
      return NextResponse.json({
        qrDataUrl: enrollment.qrDataUrl,
        secret: enrollment.base32,
      })
    }

    if (data.action === 'confirm-totp') {
      if (!user.totpPendingSecret) {
        return jsonError('Start TOTP setup first.', 400)
      }
      if (!verifyTotpCode(user.totpPendingSecret, data.code)) {
        return jsonError('Invalid 6-digit authenticator code.', 400)
      }
      const now = new Date()
      await users.updateOne(
        { _id: user._id },
        {
          $set: {
            totpEnabled: true,
            totpSecret: user.totpPendingSecret,
            totpPendingSecret: null,
            lastSecurityChangeAt: now,
            updatedAt: now,
          },
        }
      )
      await logAuditEvent({
        eventType: 'TOTP_ENABLED',
        severity: 'info',
        blocked: false,
        email: user.email,
        userId: user._id!,
        context,
      })
      const updated = await users.findOne({ _id: user._id })
      return NextResponse.json({ ok: true, user: updated ? toPublicUser(updated) : null })
    }

    if (data.action === 'disable-totp') {
      if (!user.totpEnabled || !user.totpSecret) {
        return jsonError('TOTP is not currently enabled.', 400)
      }
      if (!verifyTotpCode(user.totpSecret, data.code)) {
        return jsonError('Invalid 6-digit authenticator code.', 400)
      }
      const now = new Date()
      await users.updateOne(
        { _id: user._id },
        {
          $set: {
            totpEnabled: false,
            totpSecret: null,
            lastSecurityChangeAt: now,
            updatedAt: now,
          },
        }
      )
      await logAuditEvent({
        eventType: 'TOTP_DISABLED',
        severity: 'warning',
        blocked: false,
        email: user.email,
        userId: user._id!,
        context,
      })
      const updated = await users.findOne({ _id: user._id })
      return NextResponse.json({ ok: true, user: updated ? toPublicUser(updated) : null })
    }

    if (data.action === 'set-security-question') {
      const answerHash = await hashPassword(data.answer.toLowerCase().trim())
      const now = new Date()
      await users.updateOne(
        { _id: user._id },
        {
          $set: {
            securityQuestion: { question: data.question, answerHash },
            lastSecurityChangeAt: now,
            updatedAt: now,
          },
        }
      )
      await logAuditEvent({
        eventType: 'SECURITY_QUESTION_UPDATED',
        severity: 'info',
        blocked: false,
        email: user.email,
        userId: user._id!,
        context,
      })
      const updated = await users.findOne({ _id: user._id })
      return NextResponse.json({ ok: true, user: updated ? toPublicUser(updated) : null })
    }

    if (data.action === 'toggle-passkey') {
      const now = new Date()
      await users.updateOne(
        { _id: user._id },
        {
          $set: {
            passkeysCount: data.enabled ? 1 : 0,
            lastSecurityChangeAt: now,
            updatedAt: now,
          },
        }
      )
      await logAuditEvent({
        eventType: data.enabled ? 'PASSKEY_REGISTERED' : 'PASSKEY_REMOVED',
        severity: 'info',
        blocked: false,
        email: user.email,
        userId: user._id!,
        context,
      })
      const updated = await users.findOne({ _id: user._id })
      return NextResponse.json({ ok: true, user: updated ? toPublicUser(updated) : null })
    }

    if (data.action === 'revoke-other-sessions') {
      const rawCookie = req.cookies.get(SESSION_COOKIE_NAME)?.value
      const currentHash = rawCookie ? sha256(rawCookie) : ''
      const res = await sessions.updateMany(
        {
          userId: user._id,
          revokedAt: null,
          tokenHash: { $ne: currentHash },
        },
        { $set: { revokedAt: new Date() } }
      )
      await logAuditEvent({
        eventType: 'SESSIONS_INVALIDATED',
        severity: 'info',
        blocked: false,
        email: user.email,
        userId: user._id!,
        context,
        details: { revokedCount: res.modifiedCount, reason: 'manual_revoke_others' },
      })
      return NextResponse.json({ ok: true, revokedCount: res.modifiedCount })
    }

    return jsonError('Unsupported action', 400)
  } catch (err) {
    console.error('Security settings error:', err)
    return jsonError('Failed to update security settings.', 500)
  }
}
