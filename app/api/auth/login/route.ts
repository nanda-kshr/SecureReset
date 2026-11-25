import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getCollections } from '@/lib/db/mongodb'
import { jsonError, requireCsrf } from '@/lib/security/api-guard'
import { verifyPassword } from '@/lib/security/crypto'
import { getRequestContext } from '@/lib/security/request-context'
import { checkRateLimit, recordFailure, resetRateLimit } from '@/lib/security/rate-limit'
import { createCaptchaChallenge, verifyCaptchaChallenge } from '@/lib/security/captcha'
import { createSession, sessionCookieOptions, SESSION_COOKIE_NAME, toPublicUser } from '@/lib/security/session'
import { verifyTotpCode } from '@/lib/security/totp'
import { logAuditEvent } from '@/lib/security/audit'
import { resolveResetMode } from '@/lib/recovery/config'
import { emitTelemetry } from '@/lib/recovery/telemetry'

const LoginSchema = z.object({
  email: z.string().trim().email('Valid email is required'),
  password: z.string().min(1, 'Password is required').max(128),
  totpCode: z.string().optional(),
  captchaToken: z.string().optional(),
  captchaAnswer: z.string().optional(),
})

export async function POST(req: NextRequest) {
  const csrfError = requireCsrf(req)
  if (csrfError) return csrfError

  const context = getRequestContext(req)
  const mode = resolveResetMode(req)

  try {
    const body = await req.json()
    const parsed = LoginSchema.safeParse(body)
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message || 'Invalid credentials payload', 400)
    }

    const email = parsed.data.email.toLowerCase()
    const { password, totpCode, captchaToken, captchaAnswer } = parsed.data

    const rateKey = `login:${context.ip}:${email}`
    const rate = await checkRateLimit({
      key: rateKey,
      maxRequests: 10,
      windowMs: 15 * 60 * 1000,
      captchaThreshold: 2,
    })

    if (!rate.allowed) {
      await logAuditEvent({
        eventType: 'LOGIN_RATE_LIMITED',
        severity: 'blocked',
        blocked: true,
        email,
        context,
        details: { retryAfterSeconds: rate.retryAfterSeconds },
      })
      return jsonError(`Too many login attempts. Try again in ${rate.retryAfterSeconds}s.`, 429, {
        lockedUntil: rate.lockedUntil?.toISOString(),
        retryAfterSeconds: rate.retryAfterSeconds,
      })
    }

    if (rate.requiresCaptcha) {
      const capCheck = await verifyCaptchaChallenge(captchaToken, captchaAnswer)
      if (!capCheck.valid) {
        await logAuditEvent({
          eventType: 'CAPTCHA_FAILED',
          severity: 'blocked',
          blocked: true,
          email,
          context,
          details: { stage: 'login', reason: capCheck.reason },
        })
        return jsonError(capCheck.reason || 'CAPTCHA verification required.', 400, {
          requiresCaptcha: true,
          captcha: createCaptchaChallenge(),
        })
      }
    }

    const { users, resetTokens } = await getCollections()
    const user = await users.findOne({ email })
    const validPw = user ? await verifyPassword(password, user.passwordHash) : false

    if (!user || !validPw) {
      const failStatus = await recordFailure({
        key: rateKey,
        maxFailuresBeforeLockout: 5,
        lockoutMs: 10 * 60 * 1000,
        captchaThreshold: 2,
      })
      await logAuditEvent({
        eventType: 'LOGIN_FAILED',
        severity: failStatus.allowed ? 'warning' : 'blocked',
        blocked: true,
        email,
        userId: user?._id ?? null,
        context,
        details: { consecutiveFailures: failStatus.consecutiveFailures },
      })
      return jsonError('Invalid email or password.', 401, {
        requiresCaptcha: failStatus.requiresCaptcha,
        captcha: failStatus.requiresCaptcha ? createCaptchaChallenge() : undefined,
        lockedUntil: failStatus.lockedUntil?.toISOString(),
      })
    }

    if (user.totpEnabled && user.totpSecret) {
      if (!totpCode) {
        return jsonError('Authenticator code required for this account.', 401, {
          requiresTotp: true,
        })
      }
      if (!verifyTotpCode(user.totpSecret, totpCode)) {
        await logAuditEvent({
          eventType: 'LOGIN_TOTP_FAILED',
          severity: 'blocked',
          blocked: true,
          email,
          userId: user._id!,
          context,
        })
        return jsonError('Invalid 6-digit authenticator code.', 401, { requiresTotp: true })
      }
    }

    await resetRateLimit(rateKey)
    const now = new Date()

    // Phase 2: Signing in with existing credentials cancels any in-flight/cooling-off reset
    const cancelledRes = await resetTokens.updateMany(
      {
        userId: user._id!,
        usedAt: null,
      },
      {
        $set: {
          state: 'cancelled',
          usedAt: now,
        },
      }
    )

    if (cancelledRes.modifiedCount > 0) {
      await logAuditEvent({
        eventType: 'RESET_CANCELLED_BY_LOGIN',
        severity: 'warning',
        blocked: false,
        email,
        userId: user._id!,
        context,
        details: { cancelledCount: cancelledRes.modifiedCount },
      })
      await emitTelemetry({
        mode,
        eventType: 'RESET_CANCELLED_BY_LOGIN',
        state: 'cancelled',
        accountId: user._id!.toString(),
        outcome: 'cancelled',
        actorType: 'legitimate',
        signals: { cancelledCount: cancelledRes.modifiedCount },
      })
    }

    const knownDevices = [...(user.knownDevices || [])]
    const existingIdx = knownDevices.findIndex(
      (d) => d.fingerprint === context.deviceFingerprint && d.ip === context.ip
    )
    if (existingIdx >= 0) {
      knownDevices[existingIdx] = {
        ...knownDevices[existingIdx],
        asn: context.asn,
        location: context.location,
        lastSeenAt: now,
      }
    } else {
      knownDevices.unshift({
        fingerprint: context.deviceFingerprint,
        label: context.deviceLabel,
        ip: context.ip,
        asn: context.asn,
        location: context.location,
        lastSeenAt: now,
      })
    }

    await users.updateOne(
      { _id: user._id },
      { $set: { knownDevices: knownDevices.slice(0, 8), updatedAt: now } }
    )

    const { rawToken, expiresAt } = await createSession(user._id!, context)
    await logAuditEvent({
      eventType: 'LOGIN_SUCCESS',
      severity: 'info',
      blocked: false,
      email,
      userId: user._id!,
      context,
      details: { deviceLabel: context.deviceLabel, cancelledPendingResets: cancelledRes.modifiedCount },
    })

    const updatedUser = { ...user, knownDevices: knownDevices.slice(0, 8) }
    const res = NextResponse.json({
      user: toPublicUser(updatedUser),
      cancelledPendingResets: cancelledRes.modifiedCount,
    })
    res.cookies.set(SESSION_COOKIE_NAME, rawToken, sessionCookieOptions(expiresAt))
    return res
  } catch (err) {
    console.error('Login error:', err)
    return jsonError('Login failed.', 500)
  }
}
