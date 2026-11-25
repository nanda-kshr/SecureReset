import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getCollections } from '@/lib/db/mongodb'
import { jsonError, requireCsrf } from '@/lib/security/api-guard'
import { hashPassword, sha256 } from '@/lib/security/crypto'
import { validateNewPassword } from '@/lib/security/password'
import { getRequestContext } from '@/lib/security/request-context'
import { revokeAllUserAccessCredentials, SESSION_COOKIE_NAME } from '@/lib/security/session'
import { logAuditEvent } from '@/lib/security/audit'
import { sendPasswordChangedAlertEmail } from '@/lib/email/mailer'
import { RECOVERY_CONFIG, resolveResetMode } from '@/lib/recovery/config'
import { assertValidTransition, ResetState } from '@/lib/recovery/state-machine'
import { emitTelemetry } from '@/lib/recovery/telemetry'

const CompleteSchema = z.object({
  token: z.string().min(32),
  newPassword: z.string().min(1, 'Password is required.').max(128),
})

export async function POST(req: NextRequest) {
  const csrfError = requireCsrf(req)
  if (csrfError) return csrfError

  const context = getRequestContext(req)
  const reqMode = resolveResetMode(req)

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

    const mode = resetDoc.mode || reqMode
    const currentState: ResetState = resetDoc.state || 'requested'

    if (mode === 'standard' && resetDoc.deviceFingerprint !== context.deviceFingerprint) {
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

    if (mode !== 'naive') {
      if (currentState !== 'pending_cooling_off' || !resetDoc.otpVerified || !resetDoc.extraCheckPassed) {
        return jsonError(
          `Cannot complete password reset from state "${currentState}". Complete verification stages first.`,
          403
        )
      }

      if (resetDoc.completesAt && resetDoc.completesAt > now) {
        const remainingMinutes = Math.ceil((resetDoc.completesAt.getTime() - now.getTime()) / 60000)
        return jsonError(
          `Reset is in cooling-off period until ${resetDoc.completesAt.toUTCString()} (${remainingMinutes} min remaining).`,
          425,
          { completesAt: resetDoc.completesAt.toISOString(), state: currentState }
        )
      }

      assertValidTransition(currentState, 'completed')
    }

    const user = await users.findOne({ _id: resetDoc.userId })
    if (!user) {
      return jsonError('User account not found.', 404)
    }

    if (mode !== 'naive') {
      const pwResult = await validateNewPassword(
        newPassword,
        user.passwordHistory || [user.passwordHash],
        [user.name, user.email]
      )
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
    }

    // Atomically mark single-use reset token completed
    const claimed = await resetTokens.findOneAndUpdate(
      { _id: resetDoc._id, usedAt: null },
      { $set: { usedAt: now, state: 'completed' } }
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
    const updatedHistory = [newHash, ...(user.passwordHistory || [user.passwordHash])].slice(
      0,
      RECOVERY_CONFIG.passwordPolicy.historyLength
    )

    const knownDevices = [...(user.knownDevices || [])]
    const hasDevice = knownDevices.some(
      (d) => d.fingerprint === context.deviceFingerprint && d.ip === context.ip
    )
    if (!hasDevice) {
      knownDevices.unshift({
        fingerprint: context.deviceFingerprint,
        label: context.deviceLabel,
        ip: context.ip,
        asn: context.asn,
        location: context.location,
        lastSeenAt: now,
      })
    }

    const probationUntil =
      mode === 'framework'
        ? new Date(now.getTime() + RECOVERY_CONFIG.probation.durationHours * 3600 * 1000)
        : null

    // Note: intentionally preserves TOTP, passkeys, and security question — reset never wipes MFA
    await users.updateOne(
      { _id: user._id },
      {
        $set: {
          passwordHash: newHash,
          passwordHistory: updatedHistory,
          knownDevices: knownDevices.slice(0, 8),
          lastSecurityChangeAt: now,
          ...(probationUntil ? { probationUntil } : {}),
          updatedAt: now,
        },
      }
    )

    const revoked = await revokeAllUserAccessCredentials(user._id!, resetDoc._id)

    await sendPasswordChangedAlertEmail({
      to: user.email,
      channels: user.confirmedChannels,
      name: user.name,
      ip: context.ip,
      location: context.location,
      revokedSessionsCount: revoked.sessionsRevoked,
      probationHours: mode === 'framework' ? RECOVERY_CONFIG.probation.durationHours : undefined,
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
      details: { mode, ...revoked, probationUntil: probationUntil?.toISOString() ?? null },
    })

    await logAuditEvent({
      eventType: 'SESSIONS_INVALIDATED',
      severity: 'info',
      blocked: false,
      email: user.email,
      userId: user._id!,
      context,
      details: { ...revoked, reason: 'password_reset' },
    })

    await emitTelemetry({
      mode,
      eventType: 'PASSWORD_RESET_SUCCESS',
      state: 'completed',
      accountId: user._id!.toString(),
      assuranceAchieved: resetDoc.assuranceAchieved ?? undefined,
      assuranceRequired: resetDoc.assuranceRequired ?? undefined,
      scoreGap: resetDoc.scoreGap ?? undefined,
      computedDelayHours: resetDoc.coolingOffHours ?? 0,
      outcome: 'completed',
      actorType: resetDoc.actorType || 'unknown',
    })

    // Do NOT auto-login after reset — clear any existing session cookie
    const res = NextResponse.json({
      ok: true,
      revokedSessionsCount: revoked.sessionsRevoked,
      revokedTokensCount: revoked.refreshTokensRevoked + revoked.apiKeysRevoked,
      probationUntil: probationUntil?.toISOString() ?? null,
      message:
        'Password updated. All active sessions, refresh tokens, and API keys have been signed out. Please sign in manually.',
    })
    res.cookies.delete(SESSION_COOKIE_NAME)
    return res
  } catch (err) {
    console.error('Reset complete error:', err)
    return jsonError('Unable to complete password reset.', 500)
  }
}
