import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getCollections } from '@/lib/db/mongodb'
import { jsonError, requireCsrf } from '@/lib/security/api-guard'
import { sha256, verifyPassword } from '@/lib/security/crypto'
import { getRequestContext } from '@/lib/security/request-context'
import { createCaptchaChallenge, verifyCaptchaChallenge } from '@/lib/security/captcha'
import { verifyTotpCode } from '@/lib/security/totp'
import { logAuditEvent } from '@/lib/security/audit'

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
  }),
])

const MAX_OTP_ATTEMPTS = 5
const OTP_LOCKOUT_MS = 15 * 60 * 1000

export async function POST(req: NextRequest) {
  const csrfError = requireCsrf(req)
  if (csrfError) return csrfError

  const context = getRequestContext(req)

  try {
    const body = await req.json()
    const parsed = VerifySchema.safeParse(body)
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message || 'Invalid verification input', 400)
    }

    const { token } = parsed.data
    const tokenHash = sha256(token)
    const { resetTokens, users } = await getCollections()
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

    if (resetDoc.usedAt || resetDoc.expiresAt <= now) {
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
          used: Boolean(resetDoc.usedAt),
          expired: resetDoc.expiresAt <= now,
        },
      })
      return jsonError(
        resetDoc.usedAt
          ? 'This single-use reset token has already been used.'
          : 'This reset token has expired. Request a new reset link.',
        400
      )
    }

    if (resetDoc.deviceFingerprint !== context.deviceFingerprint) {
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
          expectedIp: resetDoc.ip,
          actualIp: context.ip,
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

    if (parsed.data.action === 'inspect') {
      const requiresCaptcha = resetDoc.otpAttempts >= 2
      return NextResponse.json({
        valid: true,
        email: resetDoc.email,
        riskLevel: resetDoc.riskLevel,
        riskScore: resetDoc.riskScore,
        riskFactors: resetDoc.riskFactors,
        extraCheckRequired: resetDoc.extraCheckRequired,
        extraCheckPassed: resetDoc.extraCheckPassed,
        otpVerified: resetDoc.otpVerified,
        securityQuestionText: user.securityQuestion?.question ?? null,
        requiresCaptcha,
        captcha: requiresCaptcha ? createCaptchaChallenge() : undefined,
        otpAttemptsRemaining: Math.max(0, MAX_OTP_ATTEMPTS - resetDoc.otpAttempts),
        lockedUntil: resetDoc.lockedUntil && resetDoc.lockedUntil > now ? resetDoc.lockedUntil.toISOString() : null,
        expiresAt: resetDoc.expiresAt.toISOString(),
      })
    }

    if (parsed.data.action === 'verify-otp') {
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

      if (resetDoc.otpAttempts >= 2) {
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
            attemptsRemaining: Math.max(0, MAX_OTP_ATTEMPTS - resetDoc.otpAttempts),
          })
        }
      }

      const otpMatches = sha256(parsed.data.otp) === resetDoc.otpHash
      if (!otpMatches) {
        const nextAttempts = resetDoc.otpAttempts + 1
        const lockedUntil =
          nextAttempts >= MAX_OTP_ATTEMPTS ? new Date(now.getTime() + OTP_LOCKOUT_MS) : null

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
          details: { attempt: nextAttempts, maxAttempts: MAX_OTP_ATTEMPTS, locked: Boolean(lockedUntil) },
        })

        const requiresCaptcha = nextAttempts >= 2
        return jsonError(
          lockedUntil
            ? 'Too many incorrect OTP attempts. This reset request is temporarily locked for 15 minutes.'
            : `Incorrect 6-digit OTP. ${MAX_OTP_ATTEMPTS - nextAttempts} attempt(s) remaining.`,
          lockedUntil ? 429 : 400,
          {
            requiresCaptcha,
            captcha: requiresCaptcha && !lockedUntil ? createCaptchaChallenge() : undefined,
            attemptsRemaining: Math.max(0, MAX_OTP_ATTEMPTS - nextAttempts),
            lockedUntil: lockedUntil?.toISOString() ?? null,
          }
        )
      }

      await resetTokens.updateOne(
        { _id: resetDoc._id },
        {
          $set: {
            otpVerified: true,
            extraCheckPassed: resetDoc.extraCheckRequired === 'none',
          },
        }
      )

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
        extraCheckRequired: resetDoc.extraCheckRequired,
        extraCheckPassed: resetDoc.extraCheckRequired === 'none',
      })
    }

    if (parsed.data.action === 'verify-extra') {
      if (!resetDoc.otpVerified) {
        return jsonError('Verify the 6-digit OTP first.', 400)
      }

      const needSecQ =
        resetDoc.extraCheckRequired === 'security_question' ||
        resetDoc.extraCheckRequired === 'both'
      const needTotp =
        resetDoc.extraCheckRequired === 'totp' || resetDoc.extraCheckRequired === 'both'

      if (needSecQ) {
        if (!user.securityQuestion?.answerHash || !parsed.data.securityAnswer) {
          return jsonError('Security question answer is required.', 400)
        }
        const okAnswer = await verifyPassword(
          parsed.data.securityAnswer.toLowerCase().trim(),
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
        if (!user.totpEnabled || !user.totpSecret || !parsed.data.totpCode) {
          return jsonError('6-digit Authenticator (TOTP) code is required.', 400)
        }
        if (!verifyTotpCode(user.totpSecret, parsed.data.totpCode)) {
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

      await resetTokens.updateOne({ _id: resetDoc._id }, { $set: { extraCheckPassed: true } })
      await logAuditEvent({
        eventType: 'EXTRA_CHECK_PASSED',
        severity: 'info',
        blocked: false,
        email: resetDoc.email,
        userId: resetDoc.userId,
        context,
        riskLevel: resetDoc.riskLevel,
        details: { check: resetDoc.extraCheckRequired },
      })

      return NextResponse.json({ ok: true, extraCheckPassed: true })
    }

    return jsonError('Unsupported verification action.', 400)
  } catch (err) {
    console.error('Reset verify error:', err)
    return jsonError('Verification error.', 500)
  }
}
