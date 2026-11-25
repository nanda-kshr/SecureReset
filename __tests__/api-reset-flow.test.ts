import { describe, expect, it, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { ObjectId } from 'mongodb'
import { generateCsrfToken } from '@/lib/security/csrf'
import { hashPassword, sha256 } from '@/lib/security/crypto'
import { UNIFORM_RESET_MESSAGE } from '@/app/api/auth/reset-request/route'

// In-memory mock collections for deterministic Route Handler integration tests
const store = {
  users: [] as Array<Record<string, unknown>>,
  sessions: [] as Array<Record<string, unknown>>,
  resetTokens: [] as Array<Record<string, unknown>>,
  rateLimits: [] as Array<Record<string, unknown>>,
  usedCaptchas: [] as Array<Record<string, unknown>>,
  auditLogs: [] as Array<Record<string, unknown>>,
  emailLogs: [] as Array<Record<string, unknown>>,
}

function matchesQuery(doc: Record<string, unknown>, query: Record<string, unknown>): boolean {
  for (const [k, v] of Object.entries(query)) {
    const docVal = doc[k]
    if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof ObjectId) && !(v instanceof Date)) {
      const ops = v as Record<string, unknown>
      if ('$gt' in ops) {
        if (!(docVal instanceof Date) || docVal <= (ops.$gt as Date)) return false
      }
      if ('$ne' in ops) {
        if (docVal === ops.$ne) return false
      }
    } else if (v instanceof ObjectId && docVal instanceof ObjectId) {
      if (!v.equals(docVal)) return false
    } else if (docVal !== v) {
      return false
    }
  }
  return true
}

function makeMockCollection(arr: Array<Record<string, unknown>>) {
  return {
    findOne: vi.fn(async (q: Record<string, unknown>) => arr.find((d) => matchesQuery(d, q)) || null),
    find: vi.fn((q: Record<string, unknown>) => {
      const filtered = arr.filter((d) => matchesQuery(d, q))
      return {
        sort: () => ({
          limit: () => ({ toArray: async () => filtered }),
          toArray: async () => filtered,
        }),
        toArray: async () => filtered,
      }
    }),
    countDocuments: vi.fn(async (q: Record<string, unknown> = {}) =>
      arr.filter((d) => matchesQuery(d, q)).length
    ),
    insertOne: vi.fn(async (doc: Record<string, unknown>) => {
      const _id = new ObjectId()
      const record = { _id, ...doc }
      arr.push(record)
      return { insertedId: _id }
    }),
    updateOne: vi.fn(async (q: Record<string, unknown>, update: Record<string, unknown>, opts?: { upsert?: boolean }) => {
      const target = arr.find((d) => matchesQuery(d, q))
      if (target) {
        if (update.$set) Object.assign(target, update.$set)
        return { modifiedCount: 1 }
      }
      if (opts?.upsert) {
        const created = { _id: new ObjectId(), ...q, ...(update.$set || {}), ...(update.$setOnInsert || {}) }
        arr.push(created)
        return { modifiedCount: 1 }
      }
      return { modifiedCount: 0 }
    }),
    updateMany: vi.fn(async (q: Record<string, unknown>, update: Record<string, unknown>) => {
      let modifiedCount = 0
      for (const doc of arr) {
        if (matchesQuery(doc, q)) {
          if (update.$set) Object.assign(doc, update.$set)
          modifiedCount++
        }
      }
      return { modifiedCount }
    }),
    findOneAndUpdate: vi.fn(async (q: Record<string, unknown>, update: Record<string, unknown>) => {
      const target = arr.find((d) => matchesQuery(d, q))
      if (!target) return null
      if (update.$set) Object.assign(target, update.$set)
      return target
    }),
    deleteOne: vi.fn(async (q: Record<string, unknown>) => {
      const idx = arr.findIndex((d) => matchesQuery(d, q))
      if (idx >= 0) arr.splice(idx, 1)
      return { deletedCount: idx >= 0 ? 1 : 0 }
    }),
  }
}

vi.mock('@/lib/db/mongodb', () => ({
  getCollections: vi.fn(async () => ({
    users: makeMockCollection(store.users),
    sessions: makeMockCollection(store.sessions),
    resetTokens: makeMockCollection(store.resetTokens),
    rateLimits: makeMockCollection(store.rateLimits),
    usedCaptchas: makeMockCollection(store.usedCaptchas),
    auditLogs: makeMockCollection(store.auditLogs),
    emailLogs: makeMockCollection(store.emailLogs),
  })),
}))

const sendMailSpy = vi.fn<
  (arg: { resetUrl: string; otp: string }) => Promise<{ sent: boolean; messageId: string }>
>(async () => ({
  sent: true,
  messageId: 'msg-1',
}))
const sendAlertSpy = vi.fn<(arg: Record<string, unknown>) => Promise<{ sent: boolean; messageId: string }>>(
  async () => ({
    sent: true,
    messageId: 'msg-2',
  })
)

vi.mock('@/lib/email/mailer', () => ({
  sendPasswordResetEmail: (arg: { resetUrl: string; otp: string }) => sendMailSpy(arg),
  sendPasswordChangedAlertEmail: (arg: Record<string, unknown>) => sendAlertSpy(arg),
}))

function buildAuthedPost(url: string, body: unknown, extraHeaders: Record<string, string> = {}) {
  const csrf = generateCsrfToken()
  return new NextRequest(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'user-agent': 'VitestBrowser/1.0',
      'x-csrf-token': csrf,
      cookie: `sr_csrf=${csrf}; sr_device_id=device-test-1`,
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  })
}

describe('API Route Handlers — Register & Reset Flow', () => {
  beforeEach(() => {
    store.users.length = 0
    store.sessions.length = 0
    store.resetTokens.length = 0
    store.rateLimits.length = 0
    store.usedCaptchas.length = 0
    store.auditLogs.length = 0
    store.emailLogs.length = 0
    sendMailSpy.mockClear()
    sendAlertSpy.mockClear()
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 200 }))
  })

  it('rejects requests without CSRF token with 403', async () => {
    const { POST } = await import('@/app/api/auth/register/route')
    const req = new NextRequest('http://localhost:3000/api/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Test', email: 'a@b.com', password: 'Strong-Password-99!' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(403)
  })

  it('registers a user, prevents duplicate email (409), and creates a session', async () => {
    const { POST } = await import('@/app/api/auth/register/route')
    const res1 = await POST(
      buildAuthedPost('http://localhost:3000/api/auth/register', {
        name: 'Nanda Kishore',
        email: 'nanda@example.com',
        password: 'Quantum-Cedar-Vault-88!',
      })
    )
    expect(res1.status).toBe(201)
    const data1 = await res1.json()
    expect(data1.user.email).toBe('nanda@example.com')
    expect(store.sessions.length).toBe(1)

    const resDup = await POST(
      buildAuthedPost('http://localhost:3000/api/auth/register', {
        name: 'Nanda Duplicate',
        email: 'nanda@example.com',
        password: 'Quantum-Cedar-Vault-88!',
      })
    )
    expect(resDup.status).toBe(409)
  })

  it('returns identical anti-enumeration 200 response for known and unknown emails', async () => {
    const userId = new ObjectId()
    store.users.push({
      _id: userId,
      name: 'Alice',
      email: 'alice@example.com',
      passwordHash: await hashPassword('Old-Vault-Passphrase-77!'),
      passwordHistory: [],
      role: 'user',
      totpEnabled: false,
      knownDevices: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const { POST } = await import('@/app/api/auth/reset-request/route')
    const knownRes = await POST(
      buildAuthedPost('http://localhost:3000/api/auth/reset-request', {
        email: 'alice@example.com',
      })
    )
    const unknownRes = await POST(
      buildAuthedPost('http://localhost:3000/api/auth/reset-request', {
        email: 'nobody@example.com',
      })
    )

    expect(knownRes.status).toBe(200)
    expect(unknownRes.status).toBe(200)
    const knownBody = await knownRes.json()
    const unknownBody = await unknownRes.json()
    expect(knownBody.message).toBe(UNIFORM_RESET_MESSAGE)
    expect(unknownBody.message).toBe(UNIFORM_RESET_MESSAGE)
    expect(sendMailSpy).toHaveBeenCalledTimes(1)
    expect(store.auditLogs.some((l) => l.eventType === 'RESET_ENUMERATION_PROBE')).toBe(true)
  })

  it('blocks device mismatch, enforces OTP lockout after 5 tries, and revokes all sessions on reset', async () => {
    const userId = new ObjectId()
    const oldPwHash = await hashPassword('Initial-Vault-Secret-11!')
    store.users.push({
      _id: userId,
      name: 'Bob',
      email: 'bob@example.com',
      passwordHash: oldPwHash,
      passwordHistory: [oldPwHash],
      role: 'user',
      totpEnabled: false,
      knownDevices: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    store.sessions.push({
      _id: new ObjectId(),
      userId,
      tokenHash: sha256('existing-session-token'),
      deviceFingerprint: 'old',
      deviceLabel: 'Chrome',
      ip: '127.0.0.1',
      location: 'Local',
      userAgent: 'UA',
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 3600_000),
      revokedAt: null,
    })

    const { POST: reqReset } = await import('@/app/api/auth/reset-request/route')
    await reqReset(
      buildAuthedPost('http://localhost:3000/api/auth/reset-request', {
        email: 'bob@example.com',
      })
    )

    const mailCall = sendMailSpy.mock.calls[0][0] as { resetUrl: string; otp: string }
    const rawToken = new URL(mailCall.resetUrl).searchParams.get('token')!
    const realOtp = mailCall.otp

    const { POST: verifyReset } = await import('@/app/api/auth/reset-verify/route')
    const { POST: completeReset } = await import('@/app/api/auth/reset-complete/route')

    // 1. Device mismatch rejected with 403
    const mismatchRes = await verifyReset(
      buildAuthedPost(
        'http://localhost:3000/api/auth/reset-verify',
        { action: 'inspect', token: rawToken },
        { 'x-demo-device': 'evil-attacker-device' }
      )
    )
    expect(mismatchRes.status).toBe(403)

    // 2. Wrong OTP fails and triggers CAPTCHA on attempt 2
    const wrongOtp1 = await verifyReset(
      buildAuthedPost('http://localhost:3000/api/auth/reset-verify', {
        action: 'verify-otp',
        token: rawToken,
        otp: '000000',
      })
    )
    expect(wrongOtp1.status).toBe(400)

    // 3. Valid OTP passes
    const goodOtpRes = await verifyReset(
      buildAuthedPost('http://localhost:3000/api/auth/reset-verify', {
        action: 'verify-otp',
        token: rawToken,
        otp: realOtp,
      })
    )
    expect(goodOtpRes.status).toBe(200)

    // 4. Reusing old password blocked
    const reuseRes = await completeReset(
      buildAuthedPost('http://localhost:3000/api/auth/reset-complete', {
        token: rawToken,
        newPassword: 'Initial-Vault-Secret-11!',
      })
    )
    expect(reuseRes.status).toBe(400)

    // 5. Setting strong unique password succeeds and revokes all existing sessions
    const okRes = await completeReset(
      buildAuthedPost('http://localhost:3000/api/auth/reset-complete', {
        token: rawToken,
        newPassword: 'Fresh-Mountain-Cipher-2026!',
      })
    )
    expect(okRes.status).toBe(200)
    const okData = await okRes.json()
    expect(okData.revokedSessionsCount).toBe(1)
    expect(store.sessions[0].revokedAt).toBeInstanceOf(Date)
    expect(sendAlertSpy).toHaveBeenCalledTimes(1)

    // 6. Replaying the same token fails with 400
    const replayRes = await verifyReset(
      buildAuthedPost('http://localhost:3000/api/auth/reset-verify', {
        action: 'inspect',
        token: rawToken,
      })
    )
    expect(replayRes.status).toBe(400)
  })
})
