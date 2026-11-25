import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getCollections } from '@/lib/db/mongodb'
import { jsonError, requireCsrf } from '@/lib/security/api-guard'
import { hashPassword, sha256 } from '@/lib/security/crypto'
import { validateNewPassword } from '@/lib/security/password'
import { getRequestContext } from '@/lib/security/request-context'
import { revokeAllUserSessions, SESSION_COOKIE_NAME } from '@/lib/security/session'
import { logAuditEvent } from '@/lib/security/audit'
import { sendPasswordChangedAlertEmail } from '@/lib/email/mailer'

const CompleteSchema = z.object({
  token: z.string().min(32),
  newPassword: z.string().min(10, 'Password must be at least 10 characters.').max(128),
})

export async function POST(req: NextRequest) {
  const csrfError = requireCsrf(req)
  if (csrfError) return csrfError

  const context = getRequestContext(req)

  try {
    const body = await req.json()
    const parsed = CompleteSchema.safeParse(body)
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message || 'Invalid password reset request.', 400)
    }

    const { token, newPassword } = parsed.data
    const tokenHash = sha256(token)
    const { resetTokens, users } = await getCollections()
    const resetDoc = await resetTokens.findOne({ tokenHash })
    const now = new Date()

    if (!resetDoc || resetDoc.usedAt || resetDoc.expiresAt <= now) {
      await logAuditEvent({
        eventType: 'TOKEN_EXPIRED_REPLAY',
        severity: 'blocked',
        blocked: true,
        email: resetDoc?.email,
        userId: resetDoc?.userId ?? null,
        context,
        details: { stage: 'reset_complete' },
      })
      return jsonError('Reset token is invalid, expired, or already used.', 400)
    }

    if (resetDoc.deviceFingerprint !== context.deviceFingerprint) {
      await logAuditEvent({
        eventType: 'TOKEN_DEVICE_MISMATCH',
        severity: 'critical',
        blocked: true,
        email: resetDoc.email,
        userId: resetDoc.userId,
        context,
        details: { stage: 'reset_complete' },
      })
      return jsonError('Device binding check failed.', 403)
    }

    if (!resetDoc.otpVerified || !resetDoc.extraCheckPassed) {
      return jsonError('Complete all verification steps before setting a new password.', 403)
    }

    const user = await users.findOne({ _id: resetDoc.userId })
    if (!user) {
      return jsonError('User account not found.', 404)
    }

    const pwResult = await validateNewPassword(newPassword, user.passwordHistory || [user.passwordHash], [
      user.name,
      user.email,
    ])
    if (!pwResult.valid) {
      const eventType = pwResult.reused
        ? 'PASSWORD_REUSE_REJECTED'
        : pwResult.breached
          ? 'PASSWORD_BREACHED_REJECTED'
          : 'PASSWORD_WEAK_REJECTED'
      await logAuditEvent({
        eventType,
        severity: 'blocked',
        blocked: true,
        email: user.email,
        userId: user._id!,
        context,
        details: {
          score: pwResult.score,
          breached: pwResult.breached,
          reused: pwResult.reused,
        },
      })
      return jsonError(pwResult.errors[0], 400, { passwordCheck: pwResult })
    }

    // Atomically mark token as single-use consumed
    const claimed = await resetTokens.findOneAndUpdate(
      { _id: resetDoc._id, usedAt: null },
      { $set: { usedAt: now } }
    )
    if (!claimed) {
      await logAuditEvent({
        eventType: 'TOKEN_EXPIRED_REPLAY',
        severity: 'blocked',
        blocked: true,
        email: user.email,
        userId: user._id!,
        context,
        details: { stage: 'atomic_claim_race' },
      })
      return jsonError('This reset token has already been used.', 400)
    }

    const newHash = await hashPassword(newPassword)
    const updatedHistory = [newHash, ...(user.passwordHistory || [user.passwordHash])].slice(0, 5)

    const knownDevices = [...(user.knownDevices || [])]
    const hasDevice = knownDevices.some(
      (d) => d.fingerprint === context.deviceFingerprint && d.ip === context.ip
    )
    if (!hasDevice) {
      knownDevices.unshift({
        fingerprint: context.deviceFingerprint,
        label: context.deviceLabel,
        ip: context.ip,
        location: context.location,
        lastSeenAt: now,
      })
    }

    await users.updateOne(
      { _id: user._id },
      {
        $set: {
          passwordHash: newHash,
          passwordHistory: updatedHistory,
          knownDevices: knownDevices.slice(0, 8),
          updatedAt: now,
        },
      }
    )

    const revokedSessionsCount = await revokeAllUserSessions(user._id!)
    await sendPasswordChangedAlertEmail({
      to: user.email,
      name: user.name,
      ip: context.ip,
      location: context.location,
      revokedSessionsCount,
    })

    await logAuditEvent({
      eventType: 'PASSWORD_RESET_SUCCESS',
      severity: 'info',
      blocked: false,
      email: user.email,
      userId: user._id!,
      context,
      riskLevel: resetDoc.riskLevel,
      riskScore: resetDoc.riskScore,
      details: { revokedSessionsCount },
    })

    await logAuditEvent({
      eventType: 'SESSIONS_INVALIDATED',
      severity: 'info',
      blocked: false,
      email: user.email,
      userId: user._id!,
      context,
      details: { revokedSessionsCount, reason: 'password_reset' },
    })

    const res = NextResponse.json({
      ok: true,
      revokedSessionsCount,
      message: 'Password updated successfully. All active sessions have been signed out.',
    })
    res.cookies.delete(SESSION_COOKIE_NAME)
    return res
  } catch (err) {
    console.error('Reset complete error:', err)
    return jsonError('Unable to complete password reset.', 500)
  }
}
