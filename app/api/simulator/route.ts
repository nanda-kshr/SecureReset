import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getCollections } from '@/lib/db/mongodb'
import { jsonError, requireCsrf } from '@/lib/security/api-guard'
import { generateOtp, generateRandomToken, hashPassword, sha256 } from '@/lib/security/crypto'
import { extractContextFromHeaders } from '@/lib/security/request-context'
import { assessResetRisk } from '@/lib/security/risk'
import { validateNewPassword } from '@/lib/security/password'
import { logAuditEvent } from '@/lib/security/audit'
import { UNIFORM_RESET_MESSAGE } from '@/app/api/auth/reset-request/route'

const SimSchema = z.object({
  scenario: z.enum([
    'enumeration',
    'otp_bruteforce',
    'token_replay',
    'device_hijack',
    'breached_password',
  ]),
})

export interface SimulationStep {
  step: string
  naiveBehavior: string
  secureBehavior: string
  blocked: boolean
  statusCode: number
  auditEvent: string
}

async function ensureSandboxUser() {
  const { users } = await getCollections()
  const email = 'sim-victim@securereset.demo'
  let user = await users.findOne({ email })
  if (!user) {
    const now = new Date()
    const pwHash = await hashPassword('Sandbox-Vault-Key-9942!')
    const res = await users.insertOne({
      name: 'Sandbox Demo User',
      email,
      passwordHash: pwHash,
      passwordHistory: [pwHash],
      role: 'user',
      totpEnabled: true,
      totpSecret: 'JBSWY3DPEHPK3PXP',
      totpPendingSecret: null,
      securityQuestion: {
        question: 'What is the name of your first school?',
        answerHash: await hashPassword('oakridge'),
      },
      knownDevices: [
        {
          fingerprint: 'trusted-lab-fp-001',
          label: 'Chrome on macOS',
          ip: '10.0.0.12',
          location: 'Bengaluru, IN',
          lastSeenAt: now,
        },
      ],
      createdAt: now,
      updatedAt: now,
    })
    user = await users.findOne({ _id: res.insertedId })
  }
  return user!
}

export async function POST(req: NextRequest) {
  const csrfError = requireCsrf(req)
  if (csrfError) return csrfError

  const attackerHeaders = new Headers({
    'user-agent': 'AttackSimulator/2.0 (Kali Linux)',
    'x-demo-ip': '185.220.101.42',
    'x-demo-location': 'Moscow, RU',
    'x-demo-device': 'attacker-kali-box',
  })
  const attackContext = extractContextFromHeaders(attackerHeaders)

  try {
    const body = await req.json()
    const parsed = SimSchema.safeParse(body)
    if (!parsed.success) {
      return jsonError('Invalid attack scenario.', 400)
    }

    const sandboxUser = await ensureSandboxUser()
    const { resetTokens } = await getCollections()
    const steps: SimulationStep[] = []
    const scenario = parsed.data.scenario

    if (scenario === 'enumeration') {
      const probes = [
        { email: sandboxUser.email, exists: true },
        { email: 'ceo-nonexistent@acme-corp.test', exists: false },
        { email: 'admin-missing@securereset.demo', exists: false },
      ]

      for (const probe of probes) {
        await logAuditEvent({
          eventType: probe.exists ? 'RESET_REQUESTED' : 'RESET_ENUMERATION_PROBE',
          severity: probe.exists ? 'info' : 'warning',
          blocked: false,
          email: probe.email,
          context: attackContext,
          details: { simulated: true, accountExists: probe.exists, responseUniform: true },
        })

        steps.push({
          step: `POST /api/auth/reset-request (${probe.email})`,
          naiveBehavior: probe.exists
            ? 'HTTP 200: "Reset email sent!" (Confirms account exists)'
            : 'HTTP 404: "No account found with that email" (Leaks valid emails!)',
          secureBehavior: `HTTP 200: "${UNIFORM_RESET_MESSAGE}" (Constant timing, zero leak)`,
          blocked: true,
          statusCode: 200,
          auditEvent: probe.exists ? 'RESET_REQUESTED' : 'RESET_ENUMERATION_PROBE',
        })
      }
    } else if (scenario === 'otp_bruteforce') {
      const rawToken = generateRandomToken(32)
      const realOtp = generateOtp()
      const now = new Date()
      const tokenHash = sha256(rawToken)

      await resetTokens.insertOne({
        userId: sandboxUser._id!,
        email: sandboxUser.email,
        tokenHash,
        otpHash: sha256(realOtp),
        deviceFingerprint: attackContext.deviceFingerprint,
        ip: attackContext.ip,
        location: attackContext.location,
        riskScore: 45,
        riskLevel: 'medium',
        riskFactors: ['Simulated OTP brute-force test'],
        extraCheckRequired: 'none',
        extraCheckPassed: true,
        otpVerified: false,
        otpAttempts: 0,
        lockedUntil: null,
        usedAt: null,
        expiresAt: new Date(now.getTime() + 15 * 60 * 1000),
        createdAt: now,
      })

      for (let attempt = 1; attempt <= 6; attempt++) {
        const guess = String(100000 + attempt * 111).slice(0, 6)
        if (attempt <= 4) {
          const captchaTrig = attempt >= 2
          await resetTokens.updateOne({ tokenHash }, { $set: { otpAttempts: attempt } })
          await logAuditEvent({
            eventType: 'OTP_FAILED',
            severity: 'blocked',
            blocked: true,
            email: sandboxUser.email,
            userId: sandboxUser._id!,
            context: attackContext,
            details: { simulated: true, attempt, guess, captchaTriggered: captchaTrig },
          })
          steps.push({
            step: `Attempt #${attempt}: Guess OTP "${guess}"`,
            naiveBehavior: `HTTP 400: Wrong OTP (Allows unlimited guesses at 1,000 req/s)`,
            secureBehavior: captchaTrig
              ? `HTTP 400: Rejected + CAPTCHA challenge enforced (${5 - attempt} tries left)`
              : `HTTP 400: Rejected (${5 - attempt} tries left)`,
            blocked: true,
            statusCode: 400,
            auditEvent: 'OTP_FAILED',
          })
        } else {
          const lockedUntil = new Date(now.getTime() + 15 * 60 * 1000)
          await resetTokens.updateOne(
            { tokenHash },
            { $set: { otpAttempts: attempt, lockedUntil, usedAt: now } }
          )
          await logAuditEvent({
            eventType: 'OTP_LOCKOUT',
            severity: 'critical',
            blocked: true,
            email: sandboxUser.email,
            userId: sandboxUser._id!,
            context: attackContext,
            details: { simulated: true, attempt, lockedMinutes: 15 },
          })
          steps.push({
            step: `Attempt #${attempt}: Guess OTP "${guess}"`,
            naiveBehavior: `HTTP 400: Still accepting guesses — 6-digit space cracked in minutes`,
            secureBehavior: `HTTP 429: Account/token locked for 15 minutes after 5 failed attempts`,
            blocked: true,
            statusCode: 429,
            auditEvent: 'OTP_LOCKOUT',
          })
        }
      }
    } else if (scenario === 'token_replay') {
      const rawToken = generateRandomToken(32)
      const tokenHash = sha256(rawToken)
      const past = new Date(Date.now() - 20 * 60 * 1000)

      await resetTokens.insertOne({
        userId: sandboxUser._id!,
        email: sandboxUser.email,
        tokenHash,
        otpHash: sha256('123456'),
        deviceFingerprint: attackContext.deviceFingerprint,
        ip: attackContext.ip,
        location: attackContext.location,
        riskScore: 15,
        riskLevel: 'low',
        riskFactors: ['Simulated replay attack'],
        extraCheckRequired: 'none',
        extraCheckPassed: true,
        otpVerified: true,
        otpAttempts: 0,
        lockedUntil: null,
        usedAt: past,
        expiresAt: past,
        createdAt: new Date(past.getTime() - 15 * 60 * 1000),
      })

      await logAuditEvent({
        eventType: 'TOKEN_EXPIRED_REPLAY',
        severity: 'blocked',
        blocked: true,
        email: sandboxUser.email,
        userId: sandboxUser._id!,
        context: attackContext,
        details: { simulated: true, tokenHashPrefix: tokenHash.slice(0, 12) },
      })

      steps.push({
        step: `Replay consumed/expired 256-bit token (${rawToken.slice(0, 12)}...)`,
        naiveBehavior: 'HTTP 200: Predictable/reusable token allows second password overwrite',
        secureBehavior: 'HTTP 400: Rejected (SHA-256 hash marked usedAt & expired > 15m)',
        blocked: true,
        statusCode: 400,
        auditEvent: 'TOKEN_EXPIRED_REPLAY',
      })
    } else if (scenario === 'device_hijack') {
      const victimHeaders = new Headers({
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X)',
        'x-demo-ip': '10.0.0.12',
        'x-demo-location': 'Bengaluru, IN',
        'x-demo-device': 'victim-trusted-macbook',
      })
      const victimContext = extractContextFromHeaders(victimHeaders)
      const risk = assessResetRisk({
        user: sandboxUser,
        context: attackContext,
        recentFailedAttempts: 2,
      })

      await logAuditEvent({
        eventType: 'RISK_ASSESSED',
        severity: 'warning',
        blocked: false,
        email: sandboxUser.email,
        userId: sandboxUser._id!,
        context: attackContext,
        riskLevel: risk.level,
        riskScore: risk.score,
        details: { simulated: true, factors: risk.factors, extraCheckRequired: risk.extraCheckRequired },
      })

      await logAuditEvent({
        eventType: 'TOKEN_DEVICE_MISMATCH',
        severity: 'critical',
        blocked: true,
        email: sandboxUser.email,
        userId: sandboxUser._id!,
        context: attackContext,
        riskLevel: risk.level,
        riskScore: risk.score,
        details: {
          simulated: true,
          expectedDevice: victimContext.deviceFingerprint,
          attackerDevice: attackContext.deviceFingerprint,
        },
      })

      steps.push({
        step: `Risk Engine Check from ${attackContext.location} (${attackContext.ip})`,
        naiveBehavior: 'No device, IP, or location check — treats foreign attacker identically to owner',
        secureBehavior: `Risk Score ${risk.score}/100 (${risk.level.toUpperCase()}): Escalates to ${risk.extraCheckRequired}`,
        blocked: false,
        statusCode: 200,
        auditEvent: 'RISK_ASSESSED',
      })

      steps.push({
        step: `Redeem Victim's Reset Link from Attacker Device`,
        naiveBehavior: 'HTTP 200: Stolen email link works from any browser/country',
        secureBehavior: 'HTTP 403: Blocked! Device fingerprint mismatch against bound reset token',
        blocked: true,
        statusCode: 403,
        auditEvent: 'TOKEN_DEVICE_MISMATCH',
      })
    } else if (scenario === 'breached_password') {
      const result = await validateNewPassword('Password123!', sandboxUser.passwordHistory, [
        sandboxUser.name,
        sandboxUser.email,
      ])

      await logAuditEvent({
        eventType: result.breached ? 'PASSWORD_BREACHED_REJECTED' : 'PASSWORD_WEAK_REJECTED',
        severity: 'blocked',
        blocked: true,
        email: sandboxUser.email,
        userId: sandboxUser._id!,
        context: attackContext,
        details: {
          simulated: true,
          score: result.score,
          breached: result.breached,
          breachCount: result.breachCount,
          source: result.breachSource,
        },
      })

      steps.push({
        step: `Submit breached/weak password "Password123!"`,
        naiveBehavior: 'HTTP 200: Accepts weak/leaked password as long as length >= 8',
        secureBehavior: `HTTP 400: Blocked! zxcvbn score ${result.score}/4 & HIBP k-anonymity (${result.breachCount.toLocaleString()} breaches via ${result.breachSource})`,
        blocked: true,
        statusCode: 400,
        auditEvent: result.breached ? 'PASSWORD_BREACHED_REJECTED' : 'PASSWORD_WEAK_REJECTED',
      })
    }

    return NextResponse.json({
      ok: true,
      scenario,
      attackerContext: {
        ip: attackContext.ip,
        location: attackContext.location,
        deviceLabel: attackContext.deviceLabel,
      },
      steps,
    })
  } catch (err) {
    console.error('Simulator error:', err)
    return jsonError('Failed to execute attack simulation.', 500)
  }
}
