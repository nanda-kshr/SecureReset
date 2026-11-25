import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getCollections } from '@/lib/db/mongodb'
import { jsonError, requireCsrf } from '@/lib/security/api-guard'
import {
  generateRandomToken,
  getEnvSecret,
  maskEmailForDisplay,
  sha256,
  signHmac,
  verifyBrowserKeySignature,
  verifyOtpHash,
  verifyPassword,
  verifyRecoveryCodeHash,
} from '@/lib/security/crypto'
import { getRequestContext } from '@/lib/security/request-context'
import { createCaptchaChallenge, verifyCaptchaChallenge } from '@/lib/security/captcha'
import { verifyTotpCode } from '@/lib/security/totp'
import { logAuditEvent } from '@/lib/security/audit'
import { RECOVERY_CONFIG, resolveResetMode } from '@/lib/recovery/config'
import { computeAssuranceAssessment } from '@/lib/recovery/assurance'
import { assertValidTransition, ResetState } from '@/lib/recovery/state-machine'
import { emitTelemetry } from '@/lib/recovery/telemetry'
import { sendCoolingOffVetoEmail } from '@/lib/email/mailer'

const VerifySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('inspect'), token: z.string().min(32) }),
  z.object({
    action: z.literal('verify-otp'),
    token: z.string().min(32),
    otp: z.string().regex(/^\d{6}$/, 'Enter the 6-digit OTP.'),
    captchaToken: z.string().optional(),
    captchaAnswer: z.string().optional(),
  }),
  z.object({
    action: z.literal('verify-extra'),
    token: z.string().min(32),
    securityAnswer: z.string().optional(),
    totpCode: z.string().optional(),
    recoveryCode: z.string().optional(),
    browserKeyId: z.string().optional(),
    browserKeySignature: z.string().optional(),
  }),
])

function createStatusHandle(resetId: string): string {
  const payload = Buffer.from(JSON.stringify({ resetId, iat: Date.now() })).toString('base64url')
  const sig = signHmac(payload, getEnvSecret('SESSION_SECRET'))
  return `${payload}.${sig}`
}

export async function POST(req: NextRequest) {
  const csrfError = requireCsrf(req)
  if (csrfError) return csrfError

  const context = getRequestContext(req)
  const reqMode = resolveResetMode(req)

  try {
    const body = await req.json()
    const parsed = VerifySchema.safeParse(body)
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message || 'Invalid verification input', 400)
    }

    const { token } = parsed.data
    const tokenHash = sha256(token)
    const { resetTokens, users, auditLogs } = await getCollections()
    const resetDoc = await resetTokens.findOne({ tokenHash })
    const now = new Date()

    if (!resetDoc) {
      await logAuditEvent({
        eventType: 'TOKEN_INVALID',
        severity: 'blocked',
        blocked: true,
        context,
        details: { reason: 'unknown_token' },
      })
      return jsonError('Invalid or unrecognized password reset link.', 400)
    }

    const mode = resetDoc.mode || reqMode
    const currentState: ResetState = resetDoc.state || 'requested'

    if (resetDoc.usedAt || resetDoc.expiresAt <= now || ['completed', 'vetoed', 'expired', 'cancelled'].includes(currentState)) {
      if (resetDoc.expiresAt <= now && !resetDoc.usedAt && currentState !== 'expired') {
        await resetTokens.updateOne({ _id: resetDoc._id }, { $set: { state: 'expired', usedAt: now } })
      }
      await logAuditEvent({
        eventType: 'TOKEN_EXPIRED_REPLAY',
        severity: 'blocked',
        blocked: true,
        email: resetDoc.email,
        userId: resetDoc.userId,
        context,
        riskLevel: resetDoc.riskLevel,
        riskScore: resetDoc.riskScore,
        details: {
          state: currentState,
          used: Boolean(resetDoc.usedAt),
          expired: resetDoc.expiresAt <= now,
        },
      })
      await emitTelemetry({
        mode,
        eventType: 'TOKEN_EXPIRED_REPLAY',
        state: currentState,
        accountId: resetDoc.userId.toString(),
        outcome: 'blocked',
        actorType: resetDoc.actorType || 'unknown',
      })
      return jsonError(
        currentState === 'vetoed'
          ? 'This password reset was vetoed by the account owner.'
          : resetDoc.usedAt
            ? 'This single-use reset token has already been used.'
            : 'This reset token has expired. Request a new reset link.',
        400
      )
    }

    // In standard mode (Phase 1 strict device binding), mismatch blocks immediately.
    // In framework mode, a missing/different device cookie is a normal case handled via assurance & cooling-off!
    if (mode === 'standard' && resetDoc.deviceFingerprint !== context.deviceFingerprint) {
      await logAuditEvent({
        eventType: 'TOKEN_DEVICE_MISMATCH',
        severity: 'critical',
        blocked: true,
        email: resetDoc.email,
        userId: resetDoc.userId,
        context,
        riskLevel: 'high',
        riskScore: 95,
        details: {
          expectedDevice: resetDoc.deviceFingerprint,
          actualDevice: context.deviceFingerprint,
        },
      })
      return jsonError(
        'Device binding check failed. This reset token can only be used from the requesting device.',
        403
      )
    }

    const user = await users.findOne({ _id: resetDoc.userId })
    if (!user) {
      return jsonError('Associated account no longer exists.', 404)
    }

    const activeBrowserKeys = (user.trustedBrowserKeys || []).filter((k) => !k.revokedAt)

    if (parsed.data.action === 'inspect') {
      const requiresCaptcha = resetDoc.otpAttempts >= RECOVERY_CONFIG.tokens.captchaThreshold
      return NextResponse.json({
        valid: true,
        mode,
        state: currentState,
        maskedEmail: maskEmailForDisplay(resetDoc.email),
        riskLevel: resetDoc.riskLevel,
        riskScore: resetDoc.riskScore,
        riskFactors: resetDoc.riskFactors,
        extraCheckRequired: resetDoc.extraCheckRequired,
        extraCheckPassed: resetDoc.extraCheckPassed,
        otpVerified: resetDoc.otpVerified,
        securityQuestionText: user.securityQuestion?.question ?? null,
        hasEnrolledBrowserKeys: activeBrowserKeys.length > 0,
        enrolledKeyIds: activeBrowserKeys.map((k) => k.keyId),
        recoveryCodesAvailable: (user.recoveryCodes || []).some((c) => !c.usedAt),
        assuranceAchieved: resetDoc.assuranceAchieved ?? null,
        assuranceRequired: resetDoc.assuranceRequired ?? null,
        scoreGap: resetDoc.scoreGap ?? null,
        coolingOffHours: resetDoc.coolingOffHours ?? null,
        completesAt: resetDoc.completesAt?.toISOString() ?? null,
        statusHandle:
          currentState === 'pending_cooling_off' ? createStatusHandle(resetDoc._id!.toString()) : null,
        requiresCaptcha,
        captcha: requiresCaptcha ? createCaptchaChallenge() : undefined,
        otpAttemptsRemaining: Math.max(0, RECOVERY_CONFIG.tokens.otpMaxAttempts - resetDoc.otpAttempts),
        lockedUntil: resetDoc.lockedUntil && resetDoc.lockedUntil > now ? resetDoc.lockedUntil.toISOString() : null,
        expiresAt: resetDoc.expiresAt.toISOString(),
      })
    }

    if (parsed.data.action === 'verify-otp') {
      if (currentState !== 'requested') {
        return jsonError(`Cannot verify OTP from state "${currentState}".`, 400)
      }

      if (resetDoc.lockedUntil && resetDoc.lockedUntil > now) {
        const retrySec = Math.ceil((resetDoc.lockedUntil.getTime() - now.getTime()) / 1000)
        await logAuditEvent({
          eventType: 'OTP_LOCKOUT',
          severity: 'blocked',
          blocked: true,
          email: resetDoc.email,
          userId: resetDoc.userId,
          context,
          details: { retryAfterSeconds: retrySec },
        })
        return jsonError(`OTP verification locked due to repeated failures. Retry in ${retrySec}s.`, 429, {
          lockedUntil: resetDoc.lockedUntil.toISOString(),
        })
      }

      if (resetDoc.otpAttempts >= RECOVERY_CONFIG.tokens.captchaThreshold) {
        const capCheck = await verifyCaptchaChallenge(
          parsed.data.captchaToken,
          parsed.data.captchaAnswer
        )
        if (!capCheck.valid) {
          await logAuditEvent({
            eventType: 'CAPTCHA_FAILED',
            severity: 'blocked',
            blocked: true,
            email: resetDoc.email,
            userId: resetDoc.userId,
            context,
            details: { stage: 'verify_otp', reason: capCheck.reason },
          })
          return jsonError(capCheck.reason || 'CAPTCHA required after failed OTP attempts.', 400, {
            requiresCaptcha: true,
            captcha: createCaptchaChallenge(),
            attemptsRemaining: Math.max(0, RECOVERY_CONFIG.tokens.otpMaxAttempts - resetDoc.otpAttempts),
          })
        }
      }

      const otpMatches = resetDoc.otpSalt
        ? verifyOtpHash(parsed.data.otp, resetDoc.otpSalt, resetDoc.otpHash)
        : sha256(parsed.data.otp) === resetDoc.otpHash

      if (!otpMatches) {
        const nextAttempts = resetDoc.otpAttempts + 1
        const lockedUntil =
          nextAttempts >= RECOVERY_CONFIG.tokens.otpMaxAttempts
            ? new Date(now.getTime() + RECOVERY_CONFIG.tokens.otpLockoutMinutes * 60 * 1000)
            : null

        await resetTokens.updateOne(
          { _id: resetDoc._id },
          { $set: { otpAttempts: nextAttempts, lockedUntil } }
        )

        await logAuditEvent({
          eventType: lockedUntil ? 'OTP_LOCKOUT' : 'OTP_FAILED',
          severity: lockedUntil ? 'critical' : 'blocked',
          blocked: true,
          email: resetDoc.email,
          userId: resetDoc.userId,
          context,
          riskLevel: resetDoc.riskLevel,
          riskScore: resetDoc.riskScore,
          details: {
            attempt: nextAttempts,
            maxAttempts: RECOVERY_CONFIG.tokens.otpMaxAttempts,
            locked: Boolean(lockedUntil),
          },
        })
        await emitTelemetry({
          mode,
          eventType: lockedUntil ? 'OTP_LOCKOUT' : 'OTP_FAILED',
          state: currentState,
          accountId: resetDoc.userId.toString(),
          outcome: 'blocked',
          actorType: resetDoc.actorType || 'unknown',
          signals: { attempt: nextAttempts },
        })

        const requiresCaptcha = nextAttempts >= RECOVERY_CONFIG.tokens.captchaThreshold
        return jsonError(
          lockedUntil
            ? 'Too many incorrect OTP attempts. This reset request is temporarily locked for 15 minutes.'
            : `Incorrect 6-digit OTP. ${RECOVERY_CONFIG.tokens.otpMaxAttempts - nextAttempts} attempt(s) remaining.`,
          lockedUntil ? 429 : 400,
          {
            requiresCaptcha,
            captcha: requiresCaptcha && !lockedUntil ? createCaptchaChallenge() : undefined,
            attemptsRemaining: Math.max(0, RECOVERY_CONFIG.tokens.otpMaxAttempts - nextAttempts),
            lockedUntil: lockedUntil?.toISOString() ?? null,
          }
        )
      }

      // Transition strictly: requested -> email_verified
      assertValidTransition(currentState, 'email_verified')

      // In standard mode with no extra checks, advance immediately email_verified -> pending_cooling_off (0h delay)
      if (mode === 'standard' && resetDoc.extraCheckRequired === 'none') {
        assertValidTransition('email_verified', 'pending_cooling_off')
        await resetTokens.updateOne(
          { _id: resetDoc._id },
          {
            $set: {
              otpVerified: true,
              extraCheckPassed: true,
              state: 'pending_cooling_off',
              coolingOffHours: 0,
              completesAt: now,
            },
          }
        )
      } else {
        await resetTokens.updateOne(
          { _id: resetDoc._id },
          {
            $set: {
              otpVerified: true,
              state: 'email_verified',
            },
          }
        )
      }

      await logAuditEvent({
        eventType: 'OTP_VERIFIED',
        severity: 'info',
        blocked: false,
        email: resetDoc.email,
        userId: resetDoc.userId,
        context,
        riskLevel: resetDoc.riskLevel,
        riskScore: resetDoc.riskScore,
      })

      return NextResponse.json({
        ok: true,
        otpVerified: true,
        state: mode === 'standard' && resetDoc.extraCheckRequired === 'none' ? 'pending_cooling_off' : 'email_verified',
        extraCheckRequired: resetDoc.extraCheckRequired,
        extraCheckPassed: mode === 'standard' && resetDoc.extraCheckRequired === 'none',
      })
    }

    if (parsed.data.action === 'verify-extra') {
      const extraInput = parsed.data
      if (currentState !== 'email_verified') {
        return jsonError('Email OTP must be verified before completing assurance checks.', 400)
      }

      const needSecQ =
        resetDoc.extraCheckRequired === 'security_question' ||
        resetDoc.extraCheckRequired === 'both'
      const needTotp =
        resetDoc.extraCheckRequired === 'totp' || resetDoc.extraCheckRequired === 'both'

      if (needSecQ) {
        if (!user.securityQuestion?.answerHash || !extraInput.securityAnswer) {
          return jsonError('Security question answer is required.', 400)
        }
        const okAnswer = await verifyPassword(
          extraInput.securityAnswer.toLowerCase().trim(),
          user.securityQuestion.answerHash
        )
        if (!okAnswer) {
          await logAuditEvent({
            eventType: 'EXTRA_CHECK_FAILED',
            severity: 'blocked',
            blocked: true,
            email: resetDoc.email,
            userId: resetDoc.userId,
            context,
            riskLevel: resetDoc.riskLevel,
            details: { check: 'security_question' },
          })
          return jsonError('Incorrect security question answer.', 400)
        }
      }

      if (needTotp) {
        if (!user.totpEnabled || !user.totpSecret || !extraInput.totpCode) {
          return jsonError('6-digit Authenticator (TOTP) code is required.', 400)
        }
        if (!verifyTotpCode(user.totpSecret, extraInput.totpCode)) {
          await logAuditEvent({
            eventType: 'EXTRA_CHECK_FAILED',
            severity: 'blocked',
            blocked: true,
            email: resetDoc.email,
            userId: resetDoc.userId,
            context,
            riskLevel: resetDoc.riskLevel,
            details: { check: 'totp' },
          })
          return jsonError('Invalid Authenticator (TOTP) code.', 400)
        }
      }

      // Phase 3: Optional WebCrypto browser-bound key verification (missing key is normal, never locks out)
      let browserKeyValid = false
      let browserKeyIdUsed: string | null = null
      if (extraInput.browserKeyId && extraInput.browserKeySignature) {
        if (
          resetDoc.challengeNonce &&
          resetDoc.challengeExpiresAt &&
          resetDoc.challengeExpiresAt > now
        ) {
          const matchedKey = activeBrowserKeys.find((k) => k.keyId === extraInput.browserKeyId)
          if (
            matchedKey &&
            verifyBrowserKeySignature(
              matchedKey.publicKeyJwk,
              resetDoc.challengeNonce,
              extraInput.browserKeySignature
            )
          ) {
            browserKeyValid = true
            browserKeyIdUsed = matchedKey.keyId
            await users.updateOne(
              { _id: user._id, 'trustedBrowserKeys.keyId': matchedKey.keyId },
              { $set: { 'trustedBrowserKeys.$.lastUsedAt': now } }
            )
          }
        }
      }

      // Phase 2: Optional 64-bit+ recovery code verification (single-use, rotated on use)
      let recoveryCodeValid = false
      if (extraInput.recoveryCode && extraInput.recoveryCode.trim()) {
        const rawRecovery = extraInput.recoveryCode
        const codes = user.recoveryCodes || []
        const matchedCode = codes.find(
          (c) => !c.usedAt && verifyRecoveryCodeHash(rawRecovery, c.codeHash)
        )
        if (!matchedCode) {
          await logAuditEvent({
            eventType: 'RECOVERY_CODE_FAILED',
            severity: 'blocked',
            blocked: true,
            email: resetDoc.email,
            userId: resetDoc.userId,
            context,
          })
          return jsonError('Invalid or already-used recovery code.', 400)
        }
        recoveryCodeValid = true
        await users.updateOne(
          { _id: user._id, 'recoveryCodes.id': matchedCode.id },
          { $set: { 'recoveryCodes.$.usedAt': now } }
        )
      }

      let delayHours = 0
      let assuranceAchieved = 100
      let assuranceRequired = 50
      let scoreGap = 0
      let signals: Record<string, unknown> = {}

      if (mode === 'framework') {
        const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
        const [recentFailedAttempts, recentResetRequests] = await Promise.all([
          auditLogs.countDocuments({ userId: user._id!, blocked: true, createdAt: { $gt: oneDayAgo } }),
          resetTokens.countDocuments({ userId: user._id!, createdAt: { $gt: oneDayAgo } }),
        ])

        const assessment = computeAssuranceAssessment({
          user,
          context,
          browserKeyValid,
          recoveryCodeValid,
          recentFailedAttempts,
          recentResetRequests,
          now,
        })

        delayHours = assessment.delayHours
        assuranceAchieved = assessment.assuranceAchieved
        assuranceRequired = assessment.assuranceRequired
        scoreGap = assessment.scoreGap
        signals = assessment.signals
      }

      assertValidTransition('email_verified', 'pending_cooling_off')
      const completesAt = new Date(now.getTime() + delayHours * 3600 * 1000)
      const expiresAtExtended =
        delayHours > 0
          ? new Date(completesAt.getTime() + 24 * 60 * 60 * 1000)
          : resetDoc.expiresAt

      let vetoTokenHash: string | null = null
      let vetoExpiresAt: Date | null = null

      if (mode === 'framework') {
        const rawVetoToken = generateRandomToken(32)
        vetoTokenHash = sha256(rawVetoToken)
        vetoExpiresAt = new Date(
          Math.max(
            now.getTime() + RECOVERY_CONFIG.tokens.vetoTtlHours * 3600 * 1000,
            completesAt.getTime() + 24 * 3600 * 1000
          )
        )

        const channels =
          user.confirmedChannels && user.confirmedChannels.length > 0
            ? user.confirmedChannels
            : [{ id: 'primary', type: 'email' as const, value: user.email, verified: true, addedAt: now }]

        const vetoUrl = `${RECOVERY_CONFIG.getBaseUrl()}/veto?token=${rawVetoToken}`
        await sendCoolingOffVetoEmail({
          channels,
          name: user.name,
          vetoUrl,
          completesAt,
          delayHours,
          ip: context.ip,
          location: context.location,
        })
      }

      await resetTokens.updateOne(
        { _id: resetDoc._id },
        {
          $set: {
            state: 'pending_cooling_off',
            extraCheckPassed: true,
            assuranceRequired,
            assuranceAchieved,
            scoreGap,
            coolingOffHours: delayHours,
            completesAt,
            expiresAt: expiresAtExtended,
            vetoTokenHash,
            vetoExpiresAt,
            browserKeyIdUsed,
            recoveryCodeUsed: recoveryCodeValid,
            challengeNonce: null,
          },
        }
      )

      await logAuditEvent({
        eventType: 'COOLING_OFF_ENTERED',
        severity: delayHours > 0 ? 'warning' : 'info',
        blocked: false,
        email: resetDoc.email,
        userId: resetDoc.userId,
        context,
        riskLevel: resetDoc.riskLevel,
        riskScore: resetDoc.riskScore,
        details: {
          mode,
          delayHours,
          assuranceAchieved,
          assuranceRequired,
          browserKeyValid,
          recoveryCodeValid,
        },
      })

      await emitTelemetry({
        mode,
        eventType: 'COOLING_OFF_ENTERED',
        state: 'pending_cooling_off',
        accountId: resetDoc.userId.toString(),
        signals,
        assuranceAchieved,
        assuranceRequired,
        scoreGap,
        computedDelayHours: delayHours,
        outcome: delayHours > 0 ? 'pending' : 'allowed',
        actorType: resetDoc.actorType || 'unknown',
      })

      return NextResponse.json({
        ok: true,
        state: 'pending_cooling_off',
        extraCheckPassed: true,
        assuranceAchieved,
        assuranceRequired,
        scoreGap,
        coolingOffHours: delayHours,
        completesAt: completesAt.toISOString(),
        statusHandle: createStatusHandle(resetDoc._id!.toString()),
      })
    }

    return jsonError('Unsupported verification action.', 400)
  } catch (err) {
    console.error('Reset verify error:', err)
    return jsonError('Verification error.', 500)
  }
}
