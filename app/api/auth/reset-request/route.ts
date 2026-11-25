import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getCollections } from '@/lib/db/mongodb'
import { jsonError, requireCsrf } from '@/lib/security/api-guard'
import {
  generateOtp,
  generateRandomToken,
  hashOtp,
  sha256,
  verifyPassword,
} from '@/lib/security/crypto'
import { getRequestContext } from '@/lib/security/request-context'
import { checkRateLimit, getFailureStatus, recordFailure } from '@/lib/security/rate-limit'
import { createCaptchaChallenge, verifyCaptchaChallenge } from '@/lib/security/captcha'
import { assessResetRisk } from '@/lib/security/risk'
import { logAuditEvent } from '@/lib/security/audit'
import { sendPasswordResetEmail } from '@/lib/email/mailer'
import { RECOVERY_CONFIG, resolveResetMode } from '@/lib/recovery/config'
import { emitTelemetry } from '@/lib/recovery/telemetry'

const RequestSchema = z.object({
  email: z.string().trim().email('Please enter a valid email address.'),
  captchaToken: z.string().optional(),
  captchaAnswer: z.string().optional(),
  actorType: z.enum(['attacker', 'legitimate', 'unknown']).optional(),
})

export const UNIFORM_RESET_MESSAGE =
  "If an account with that email exists, we've sent password reset instructions and a 6-digit verification code."

const DUMMY_HASH = '$2b$12$CwTycUXWue0Thq9StjUM0uJ8y6p6r8sR7Q9m4x1B2z3K5w8V7e2Gu'

export async function POST(req: NextRequest) {
  const csrfError = requireCsrf(req)
  if (csrfError) return csrfError

  const context = getRequestContext(req)
  const mode = resolveResetMode(req)
  const startedAt = Date.now()

  try {
    const body = await req.json()
    const parsed = RequestSchema.safeParse(body)
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message || 'Valid email is required.', 400)
    }

    const email = parsed.data.email.toLowerCase()
    const actorType = parsed.data.actorType || 'unknown'

    // Rate-limit per IP and per account only in standard & framework modes;
    // never revoke active sessions or lock out the user account on reset request (prevents DoS).
    if (mode !== 'naive') {
      const ipRateKey = `reset_req:ip:${context.ip}`
      const emailRateKey = `reset_req:email:${email}`

      const [ipRate, emailRate, failStatus] = await Promise.all([
        checkRateLimit({
          key: ipRateKey,
          maxRequests: RECOVERY_CONFIG.rateLimits.resetPerIpMax,
          windowMs: RECOVERY_CONFIG.rateLimits.windowMs,
          captchaThreshold: 3,
        }),
        checkRateLimit({
          key: emailRateKey,
          maxRequests: RECOVERY_CONFIG.rateLimits.resetPerAccountMax,
          windowMs: RECOVERY_CONFIG.rateLimits.windowMs,
          captchaThreshold: 2,
        }),
        getFailureStatus(`reset_captcha:${context.ip}`, 2),
      ])

      if (!ipRate.allowed || !emailRate.allowed) {
        const retryAfterSeconds = Math.max(ipRate.retryAfterSeconds, emailRate.retryAfterSeconds)
        await logAuditEvent({
          eventType: 'RESET_RATE_LIMITED',
          severity: 'blocked',
          blocked: true,
          email,
          context,
          details: { retryAfterSeconds, mode },
        })
        await emitTelemetry({
          mode,
          eventType: 'RESET_RATE_LIMITED',
          state: 'none',
          accountId: email,
          outcome: 'blocked',
          actorType,
        })
        return jsonError(
          `Too many password reset requests. Please wait ${retryAfterSeconds}s before trying again.`,
          429,
          {
            retryAfterSeconds,
            requiresCaptcha: true,
            captcha: createCaptchaChallenge(),
          }
        )
      }

      const needsCaptcha =
        failStatus.requiresCaptcha || ipRate.remaining <= 2 || emailRate.remaining <= 1

      if (needsCaptcha) {
        const capCheck = await verifyCaptchaChallenge(
          parsed.data.captchaToken,
          parsed.data.captchaAnswer
        )
        if (!capCheck.valid) {
          await recordFailure({
            key: `reset_captcha:${context.ip}`,
            maxFailuresBeforeLockout: 10,
            captchaThreshold: 1,
          })
          await logAuditEvent({
            eventType: 'CAPTCHA_FAILED',
            severity: 'blocked',
            blocked: true,
            email,
            context,
            details: { stage: 'reset_request', reason: capCheck.reason },
          })
          return jsonError(
            capCheck.reason || 'Security CAPTCHA verification is required due to repeated requests.',
            400,
            {
              requiresCaptcha: true,
              captcha: createCaptchaChallenge(),
            }
          )
        }
      }
    }

    const { users, resetTokens, auditLogs } = await getCollections()
    const user = await users.findOne({ email })

    if (!user) {
      if (mode === 'naive') {
        // Naive mode intentionally reveals missing email for Phase 5 evaluation comparison
        return jsonError('No account found with that email address.', 404)
      }

      // Constant-cost work + timing floor to mitigate account enumeration timing side-channels
      await verifyPassword('dummy-timing-equalizer', DUMMY_HASH)
      const elapsed = Date.now() - startedAt
      if (elapsed < 120) {
        await new Promise((r) => setTimeout(r, 120 - elapsed))
      }

      await logAuditEvent({
        eventType: 'RESET_ENUMERATION_PROBE',
        severity: 'warning',
        blocked: false,
        email,
        context,
        details: { accountFound: false, responseUniform: true, mode },
      })
      await emitTelemetry({
        mode,
        eventType: 'RESET_ENUMERATION_PROBE',
        state: 'none',
        accountId: email,
        outcome: 'blocked',
        actorType,
      })

      return NextResponse.json({
        ok: true,
        message: UNIFORM_RESET_MESSAGE,
      })
    }

    const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000)
    const recentFailedAttempts = await auditLogs.countDocuments({
      userId: user._id!,
      blocked: true,
      createdAt: { $gt: thirtyMinsAgo },
    })

    const risk = assessResetRisk({ user, context, recentFailedAttempts })
    const rawToken = generateRandomToken(RECOVERY_CONFIG.tokens.resetByteLength)
    const otp = generateOtp()
    const otpSalt = generateRandomToken(16)
    const now = new Date()
    const expiresAt = new Date(now.getTime() + RECOVERY_CONFIG.tokens.resetTtlMinutes * 60 * 1000)

    // Issuing a new reset token invalidates prior unused tokens for this user
    await resetTokens.updateMany(
      { userId: user._id!, usedAt: null },
      { $set: { usedAt: now, state: 'cancelled' } }
    )

    await resetTokens.insertOne({
      userId: user._id!,
      email,
      tokenHash: sha256(rawToken),
      otpHash: hashOtp(otp, otpSalt),
      otpSalt,
      state: 'requested',
      mode,
      deviceFingerprint: context.deviceFingerprint,
      ip: context.ip,
      asn: context.asn,
      location: context.location,
      riskScore: risk.score,
      riskLevel: risk.level,
      riskFactors: risk.factors,
      extraCheckRequired: mode === 'naive' ? 'none' : risk.extraCheckRequired,
      extraCheckPassed: mode === 'naive' || risk.extraCheckRequired === 'none',
      otpVerified: mode === 'naive',
      otpAttempts: 0,
      lockedUntil: null,
      vetoTokenHash: null,
      vetoExpiresAt: null,
      vetoUsedAt: null,
      usedAt: null,
      expiresAt,
      actorType,
      createdAt: now,
    })

    // Always construct reset URL from fixed configured base URL (never trust Host/X-Forwarded-Host)
    const resetUrl = `${RECOVERY_CONFIG.getBaseUrl()}/reset-password?token=${rawToken}`

    await sendPasswordResetEmail({
      to: user.email,
      name: user.name,
      resetUrl,
      otp: mode === 'naive' ? undefined : otp,
      riskLevel: risk.level,
      ip: context.ip,
      location: context.location,
      expiresMinutes: RECOVERY_CONFIG.tokens.resetTtlMinutes,
    })

    await logAuditEvent({
      eventType: 'RESET_REQUESTED',
      severity: risk.level === 'high' ? 'warning' : 'info',
      blocked: false,
      email,
      userId: user._id!,
      context,
      riskLevel: risk.level,
      riskScore: risk.score,
      details: { mode, expiresMinutes: RECOVERY_CONFIG.tokens.resetTtlMinutes },
    })

    await emitTelemetry({
      mode,
      eventType: 'RESET_REQUESTED',
      state: 'requested',
      accountId: user._id!.toString(),
      outcome: 'pending',
      actorType,
      signals: { riskLevel: risk.level, riskScore: risk.score },
    })

    // Never return raw tokens, OTPs, or mode internals in API responses
    return NextResponse.json({
      ok: true,
      message: UNIFORM_RESET_MESSAGE,
    })
  } catch (err) {
    console.error('Reset request error:', err)
    return jsonError('Unable to process reset request.', 500)
  }
}
