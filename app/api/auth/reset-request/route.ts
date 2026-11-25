import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getCollections } from '@/lib/db/mongodb'
import { jsonError, requireCsrf } from '@/lib/security/api-guard'
import { generateOtp, generateRandomToken, sha256, verifyPassword } from '@/lib/security/crypto'
import { getRequestContext } from '@/lib/security/request-context'
import { checkRateLimit, getFailureStatus, recordFailure } from '@/lib/security/rate-limit'
import { createCaptchaChallenge, verifyCaptchaChallenge } from '@/lib/security/captcha'
import { assessResetRisk } from '@/lib/security/risk'
import { logAuditEvent } from '@/lib/security/audit'
import { sendPasswordResetEmail } from '@/lib/email/mailer'

const RequestSchema = z.object({
  email: z.string().trim().email('Please enter a valid email address.'),
  captchaToken: z.string().optional(),
  captchaAnswer: z.string().optional(),
})

export const UNIFORM_RESET_MESSAGE =
  "If an account with that email exists, we've sent password reset instructions and a 6-digit verification code."

const RESET_TTL_MINUTES = 15

export async function POST(req: NextRequest) {
  const csrfError = requireCsrf(req)
  if (csrfError) return csrfError

  const context = getRequestContext(req)

  try {
    const body = await req.json()
    const parsed = RequestSchema.safeParse(body)
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message || 'Valid email is required.', 400)
    }

    const email = parsed.data.email.toLowerCase()
    const ipRateKey = `reset_req:ip:${context.ip}`
    const emailRateKey = `reset_req:email:${email}`

    const [ipRate, emailRate, failStatus] = await Promise.all([
      checkRateLimit({
        key: ipRateKey,
        maxRequests: 6,
        windowMs: 15 * 60 * 1000,
        captchaThreshold: 3,
      }),
      checkRateLimit({
        key: emailRateKey,
        maxRequests: 4,
        windowMs: 15 * 60 * 1000,
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
        details: { retryAfterSeconds },
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

    const { users, resetTokens, auditLogs } = await getCollections()
    const user = await users.findOne({ email })

    // Always perform constant-cost work and return identical response to block account enumeration
    if (!user) {
      await verifyPassword('dummy-timing-equalizer', '$2b$12$CwTycUXWue0Thq9StjUM0uJ8y6p6r8sR7Q9m4x1B2z3K5w8V7e2Gu')
      await logAuditEvent({
        eventType: 'RESET_ENUMERATION_PROBE',
        severity: 'warning',
        blocked: false,
        email,
        context,
        details: { accountFound: false, responseUniform: true },
      })
      return NextResponse.json({
        ok: true,
        message: UNIFORM_RESET_MESSAGE,
      })
    }

    const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000)
    const recentFailedAttempts = await auditLogs.countDocuments({
      email,
      blocked: true,
      createdAt: { $gt: thirtyMinsAgo },
    })

    const risk = assessResetRisk({ user, context, recentFailedAttempts })
    const rawToken = generateRandomToken(32) // 256-bit random token
    const otp = generateOtp() // 6-digit OTP
    const now = new Date()
    const expiresAt = new Date(now.getTime() + RESET_TTL_MINUTES * 60 * 1000)

    // Invalidate any prior unused reset tokens for this user
    await resetTokens.updateMany(
      { userId: user._id!, usedAt: null },
      { $set: { usedAt: now } }
    )

    await resetTokens.insertOne({
      userId: user._id!,
      email,
      tokenHash: sha256(rawToken),
      otpHash: sha256(otp),
      deviceFingerprint: context.deviceFingerprint,
      ip: context.ip,
      location: context.location,
      riskScore: risk.score,
      riskLevel: risk.level,
      riskFactors: risk.factors,
      extraCheckRequired: risk.extraCheckRequired,
      extraCheckPassed: risk.extraCheckRequired === 'none',
      otpVerified: false,
      otpAttempts: 0,
      lockedUntil: null,
      usedAt: null,
      expiresAt,
      createdAt: now,
    })

    const appOrigin = (
      process.env.NEXT_PUBLIC_APP_URL || 'https://secure-reset.vercel.app'
    ).replace(/\/+$/, '')
    const resetUrl = `${appOrigin}/reset-password?token=${rawToken}`

    await sendPasswordResetEmail({
      to: user.email,
      name: user.name,
      resetUrl,
      otp,
      riskLevel: risk.level,
      ip: context.ip,
      location: context.location,
      expiresMinutes: RESET_TTL_MINUTES,
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
      details: {
        riskFactors: risk.factors,
        extraCheckRequired: risk.extraCheckRequired,
        expiresMinutes: RESET_TTL_MINUTES,
      },
    })

    return NextResponse.json({
      ok: true,
      message: UNIFORM_RESET_MESSAGE,
    })
  } catch (err) {
    console.error('Reset request error:', err)
    return jsonError('Unable to process reset request.', 500)
  }
}
