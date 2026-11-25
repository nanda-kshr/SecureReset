import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import crypto from 'node:crypto'
import { getCollections } from '@/lib/db/mongodb'
import { requireCsrf, jsonError } from '@/lib/security/api-guard'
import { hashPassword } from '@/lib/security/crypto'
import { validateNewPassword } from '@/lib/security/password'
import { getRequestContext } from '@/lib/security/request-context'
import { createSession, sessionCookieOptions, SESSION_COOKIE_NAME, toPublicUser } from '@/lib/security/session'
import { logAuditEvent } from '@/lib/security/audit'
import { RECOVERY_CONFIG } from '@/lib/recovery/config'

const RegisterSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80),
  email: z.string().trim().email('Valid email is required').max(120),
  password: z
    .string()
    .min(RECOVERY_CONFIG.passwordPolicy.minLength, `Password must be at least ${RECOVERY_CONFIG.passwordPolicy.minLength} characters`)
    .max(RECOVERY_CONFIG.passwordPolicy.maxLength),
  securityQuestion: z.string().trim().max(160).optional(),
  securityAnswer: z.string().trim().max(120).optional(),
})

export async function POST(req: NextRequest) {
  const csrfError = requireCsrf(req)
  if (csrfError) return csrfError

  const context = getRequestContext(req)

  try {
    const body = await req.json()
    const parsed = RegisterSchema.safeParse(body)
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message || 'Invalid registration data', 400)
    }

    const name = parsed.data.name
    const email = parsed.data.email.toLowerCase()
    const { password, securityQuestion, securityAnswer } = parsed.data

    const { users } = await getCollections()
    const existing = await users.findOne({ email })
    if (existing) {
      return jsonError('An account with this email already exists.', 409)
    }

    const pwResult = await validateNewPassword(password, [], [name, email])
    if (!pwResult.valid) {
      await logAuditEvent({
        eventType: pwResult.breached ? 'PASSWORD_BREACHED_REJECTED' : 'PASSWORD_WEAK_REJECTED',
        severity: 'warning',
        blocked: true,
        email,
        context,
        details: { stage: 'register', score: pwResult.score, breached: pwResult.breached },
      })
      return jsonError(pwResult.errors[0], 400, { passwordCheck: pwResult })
    }

    const passwordHash = await hashPassword(password)
    const now = new Date()

    let secQ: { question: string; answerHash: string } | null = null
    if (securityQuestion && securityAnswer && securityAnswer.length >= 2) {
      secQ = {
        question: securityQuestion,
        answerHash: await hashPassword(securityAnswer.toLowerCase().trim()),
      }
    }

    const userCount = await users.countDocuments()
    const insertRes = await users.insertOne({
      name,
      email,
      passwordHash,
      passwordHistory: [passwordHash],
      role: userCount === 0 ? 'admin' : 'user',
      totpEnabled: false,
      totpSecret: null,
      totpPendingSecret: null,
      passkeysCount: 0,
      securityQuestion: secQ,
      confirmedChannels: [
        {
          id: crypto.randomUUID(),
          type: 'email',
          value: email,
          verified: true,
          addedAt: now,
        },
      ],
      trustedBrowserKeys: [],
      recoveryCodes: [],
      probationUntil: null,
      flaggedSuspicious: false,
      flaggedReason: null,
      lastSecurityChangeAt: null,
      knownDevices: [
        {
          fingerprint: context.deviceFingerprint,
          label: context.deviceLabel,
          ip: context.ip,
          asn: context.asn,
          location: context.location,
          lastSeenAt: now,
        },
      ],
      createdAt: now,
      updatedAt: now,
    })

    const createdUser = await users.findOne({ _id: insertRes.insertedId })
    if (!createdUser) {
      return jsonError('Failed to create user.', 500)
    }

    const { rawToken, expiresAt } = await createSession(createdUser._id!, context)
    await logAuditEvent({
      eventType: 'REGISTER',
      severity: 'info',
      blocked: false,
      email,
      userId: createdUser._id!,
      context,
      details: { role: createdUser.role, hasSecurityQuestion: Boolean(secQ) },
    })

    const res = NextResponse.json({ user: toPublicUser(createdUser) }, { status: 201 })
    res.cookies.set(SESSION_COOKIE_NAME, rawToken, sessionCookieOptions(expiresAt))
    return res
  } catch (err) {
    console.error('Register error:', err)
    return jsonError('Registration failed.', 500)
  }
}
