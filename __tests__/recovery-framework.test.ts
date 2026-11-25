import { describe, expect, it, vi, beforeEach } from 'vitest'
import crypto from 'node:crypto'
import { NextRequest } from 'next/server'
import { ObjectId } from 'mongodb'
import { assertValidTransition, canTransition, IllegalStateTransitionError } from '@/lib/recovery/state-machine'
import { computeAssuranceAssessment, mapGapToDelayHours } from '@/lib/recovery/assurance'
import { enforcePostResetProbation } from '@/lib/recovery/probation'
import {
  generateRecoveryCode,
  hashPassword,
  hashRecoveryCode,
  sha256,
  verifyBrowserKeySignature,
  verifyRecoveryCodeHash,
} from '@/lib/security/crypto'
import { generateCsrfToken } from '@/lib/security/csrf'
import type { UserDoc } from '@/lib/db/mongodb'
import type { RequestContext } from '@/lib/security/request-context'
import { assertLocalTarget } from '../attacks/guard.mjs'

const store = {
  users: [] as Array<Record<string, unknown>>,
  sessions: [] as Array<Record<string, unknown>>,
  refreshTokens: [] as Array<Record<string, unknown>>,
  apiKeys: [] as Array<Record<string, unknown>>,
  resetTokens: [] as Array<Record<string, unknown>>,
  rateLimits: [] as Array<Record<string, unknown>>,
  usedCaptchas: [] as Array<Record<string, unknown>>,
  auditLogs: [] as Array<Record<string, unknown>>,
  emailLogs: [] as Array<Record<string, unknown>>,
  telemetryEvents: [] as Array<Record<string, unknown>>,
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
    } else if (v === null) {
      if (docVal !== null && docVal !== undefined) return false
    } else if (docVal !== v) {
      return false
    }
  }
  return true
}

function makeMockCollection(arr: Array<Record<string, unknown>>) {
  return {
    findOne: vi.fn(async (q: Record<string, unknown>) => arr.find((d) => matchesQuery(d, q)) || null),
    find: vi.fn((q: Record<string, unknown> = {}) => {
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
      arr.push({ _id, ...doc })
      return { insertedId: _id }
    }),
    updateOne: vi.fn(async (q: Record<string, unknown>, update: Record<string, unknown>, opts?: { upsert?: boolean }) => {
      const target = arr.find((d) => matchesQuery(d, q))
      if (target) {
        if (update.$set) Object.assign(target, update.$set)
        return { modifiedCount: 1 }
      }
      if (opts?.upsert) {
        arr.push({ _id: new ObjectId(), ...q, ...(update.$set || {}), ...(update.$setOnInsert || {}) })
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
    aggregate: vi.fn(() => ({ toArray: async () => [] })),
  }
}

vi.mock('@/lib/db/mongodb', () => ({
  getCollections: vi.fn(async () => ({
    users: makeMockCollection(store.users),
    sessions: makeMockCollection(store.sessions),
    refreshTokens: makeMockCollection(store.refreshTokens),
    apiKeys: makeMockCollection(store.apiKeys),
    resetTokens: makeMockCollection(store.resetTokens),
    rateLimits: makeMockCollection(store.rateLimits),
    usedCaptchas: makeMockCollection(store.usedCaptchas),
    auditLogs: makeMockCollection(store.auditLogs),
    emailLogs: makeMockCollection(store.emailLogs),
    telemetryEvents: makeMockCollection(store.telemetryEvents),
  })),
}))

const sendResetSpy = vi.fn<
  (arg: { resetUrl: string; otp?: string }) => Promise<{ sent: boolean }>
>(async () => ({ sent: true }))
const sendVetoSpy = vi.fn<(arg: { vetoUrl: string }) => Promise<unknown[]>>(async () => [])
const sendAlertSpy = vi.fn(async () => ({ sent: true }))

vi.mock('@/lib/email/mailer', () => ({
  sendPasswordResetEmail: (arg: { resetUrl: string; otp?: string }) => sendResetSpy(arg),
  sendCoolingOffVetoEmail: (arg: { vetoUrl: string }) => sendVetoSpy(arg),
  sendPasswordChangedAlertEmail: () => sendAlertSpy(),
}))

function buildPost(url: string, body: unknown, headers: Record<string, string> = {}) {
  const csrf = generateCsrfToken()
  return new NextRequest(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'user-agent': 'VitestBrowser/1.0',
      'x-csrf-token': csrf,
      cookie: `sr_csrf=${csrf}; sr_device_id=device-1`,
      ...headers,
    },
    body: JSON.stringify(body),
  })
}

describe('Recovery Assurance Framework (Phases 1-5)', () => {
  beforeEach(() => {
    Object.values(store).forEach((arr) => {
      arr.length = 0
    })
    sendResetSpy.mockClear()
    sendVetoSpy.mockClear()
    sendAlertSpy.mockClear()
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 200 }))
  })

  it('enforces the reset state machine and prevents illegal state skipping', () => {
    expect(canTransition('requested', 'email_verified')).toBe(true)
    expect(canTransition('email_verified', 'pending_cooling_off')).toBe(true)
    expect(canTransition('pending_cooling_off', 'completed')).toBe(true)
    expect(canTransition('requested', 'completed')).toBe(false)
    expect(canTransition('vetoed', 'completed')).toBe(false)
    expect(() => assertValidTransition('requested', 'completed')).toThrow(IllegalStateTransitionError)
  })

  it('computes piecewise-linear and logistic cooling-off curves and assurance gap', () => {
    expect(mapGapToDelayHours(0, 'piecewise-linear')).toBe(0)
    expect(mapGapToDelayHours(35, 'piecewise-linear')).toBe(12)
    expect(mapGapToDelayHours(85, 'piecewise-linear')).toBe(72)
    expect(mapGapToDelayHours(0, 'logistic')).toBe(0)
    expect(mapGapToDelayHours(40, 'logistic')).toBeGreaterThan(15)
    expect(mapGapToDelayHours(100, 'logistic')).toBeLessThanOrEqual(72)

    const user: UserDoc = {
      name: 'Eva',
      email: 'eva@example.com',
      passwordHash: 'h',
      passwordHistory: [],
      role: 'user',
      totpEnabled: true,
      totpSecret: 'JBSWY3DPEHPK3PXP',
      passkeysCount: 0,
      knownDevices: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    const ctx: RequestContext = {
      ip: '185.220.101.42',
      asn: 'AS9999',
      location: 'Moscow, RU',
      userAgent: 'curl',
      deviceFingerprint: 'unknown-fp',
      deviceLabel: 'curl',
    }
    const assessment = computeAssuranceAssessment({
      user,
      context: ctx,
      browserKeyValid: false,
      recoveryCodeValid: false,
      recentFailedAttempts: 0,
      recentResetRequests: 1,
    })
    expect(assessment.strongestMethod).toBe('totp')
    expect(assessment.assuranceRequired).toBe(75)
    expect(assessment.assuranceAchieved).toBe(0)
    expect(assessment.delayHours).toBeGreaterThan(48)
  })

  it('verifies WebCrypto ECDSA P-256 browser-bound key signatures and 80-bit recovery codes', async () => {
    const keyPair = await crypto.webcrypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign', 'verify']
    )
    const jwk = await crypto.webcrypto.subtle.exportKey('jwk', keyPair.publicKey)
    const nonce = 'challenge-nonce-xyz'
    const sigBuf = await crypto.webcrypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      keyPair.privateKey,
      new TextEncoder().encode(nonce)
    )
    const sigBase64 = Buffer.from(sigBuf).toString('base64')

    expect(verifyBrowserKeySignature(jwk, nonce, sigBase64)).toBe(true)
    expect(verifyBrowserKeySignature(jwk, 'tampered-nonce', sigBase64)).toBe(false)

    const code = generateRecoveryCode()
    expect(code.replace(/-/g, '')).toHaveLength(20) // 80 bits hex
    const hash = hashRecoveryCode(code)
    expect(verifyRecoveryCodeHash(code, hash)).toBe(true)
    expect(verifyRecoveryCodeHash('0000-0000-0000-0000-0000', hash)).toBe(false)
  })

  it('runs cooling-off veto flow, blocks premature completion, and allows login cancellation', async () => {
    const userId = new ObjectId()
    const pwHash = await hashPassword('Owner-Strong-Vault-2026!')
    store.users.push({
      _id: userId,
      name: 'Alice',
      email: 'alice@example.com',
      passwordHash: pwHash,
      passwordHistory: [pwHash],
      role: 'user',
      totpEnabled: false,
      passkeysCount: 0,
      knownDevices: [],
      confirmedChannels: [
        { id: 'c1', type: 'email', value: 'alice@example.com', verified: true, addedAt: new Date() },
      ],
      trustedBrowserKeys: [],
      recoveryCodes: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const { POST: reqReset } = await import('@/app/api/auth/reset-request/route')
    const { POST: verifyReset } = await import('@/app/api/auth/reset-verify/route')
    const { POST: completeReset } = await import('@/app/api/auth/reset-complete/route')
    const { POST: vetoReset } = await import('@/app/api/auth/veto/route')
    const { GET: getStatus } = await import('@/app/api/auth/reset-status/route')

    await reqReset(
      buildPost('http://localhost:3000/api/auth/reset-request', { email: 'alice@example.com' })
    )
    const mail = sendResetSpy.mock.calls[0][0]
    const rawToken = new URL(mail.resetUrl).searchParams.get('token')!
    const otp = mail.otp!

    // Step 1: OTP verify -> email_verified
    const otpRes = await verifyReset(
      buildPost('http://localhost:3000/api/auth/reset-verify', {
        action: 'verify-otp',
        token: rawToken,
        otp,
      })
    )
    expect(otpRes.status).toBe(200)

    // Step 2: Assurance eval with no browser key -> enters pending_cooling_off with delay > 0
    const extraRes = await verifyReset(
      buildPost('http://localhost:3000/api/auth/reset-verify', {
        action: 'verify-extra',
        token: rawToken,
      })
    )
    expect(extraRes.status).toBe(200)
    const extraData = await extraRes.json()
    expect(extraData.state).toBe('pending_cooling_off')
    expect(extraData.coolingOffHours).toBeGreaterThan(0)
    expect(sendVetoSpy).toHaveBeenCalledTimes(1)

    // Enumeration-safe status page check
    const statusRes = await getStatus(
      new NextRequest(`http://localhost:3000/api/auth/reset-status?h=${extraData.statusHandle}`)
    )
    const statusBody = await statusRes.json()
    expect(statusBody.statusText).toMatch(/Your reset completes at .* unless cancelled/i)

    // Attacker trying to complete during cooling-off gets 425 Too Early
    const earlyRes = await completeReset(
      buildPost('http://localhost:3000/api/auth/reset-complete', {
        token: rawToken,
        newPassword: 'Attacker-New-Password-99!',
      })
    )
    expect(earlyRes.status).toBe(425)

    // Owner clicks signed "This wasn't me" veto link
    const vetoUrl = sendVetoSpy.mock.calls[0][0].vetoUrl
    const vetoToken = new URL(vetoUrl).searchParams.get('token')!
    const vetoRes = await vetoReset(
      buildPost('http://localhost:3000/api/auth/veto', { vetoToken })
    )
    expect(vetoRes.status).toBe(200)
    expect(store.users[0].flaggedSuspicious).toBe(true)
    expect(store.resetTokens[0].state).toBe('vetoed')

    // Replaying veto token fails
    const vetoReplay = await vetoReset(
      buildPost('http://localhost:3000/api/auth/veto', { vetoToken })
    )
    expect(vetoReplay.status).toBe(400)
  })

  it('cancels pending reset on existing-credential login and enforces 48h post-reset probation', async () => {
    const userId = new ObjectId()
    const pwHash = await hashPassword('Legit-Password-2026!')
    store.users.push({
      _id: userId,
      name: 'Liam',
      email: 'liam@example.com',
      passwordHash: pwHash,
      passwordHistory: [pwHash],
      role: 'user',
      totpEnabled: false,
      probationUntil: new Date(Date.now() + 48 * 3600 * 1000),
      knownDevices: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    store.resetTokens.push({
      _id: new ObjectId(),
      userId,
      email: 'liam@example.com',
      tokenHash: sha256('pending-tok'),
      otpHash: 'h',
      state: 'pending_cooling_off',
      usedAt: null,
      expiresAt: new Date(Date.now() + 3600_000),
      createdAt: new Date(),
    })

    // Existing login cancels pending reset
    const { POST: login } = await import('@/app/api/auth/login/route')
    const loginRes = await login(
      buildPost('http://localhost:3000/api/auth/login', {
        email: 'liam@example.com',
        password: 'Legit-Password-2026!',
      })
    )
    expect(loginRes.status).toBe(200)
    expect(store.resetTokens[0].state).toBe('cancelled')

    // Central probation guard blocks sensitive actions and logs each blocked attempt
    const ctx: RequestContext = {
      ip: '127.0.0.1',
      asn: 'AS0',
      location: 'Local',
      userAgent: 'Vitest',
      deviceFingerprint: 'fp',
      deviceLabel: 'Vitest',
    }
    const probRes = await enforcePostResetProbation({
      user: store.users[0] as unknown as UserDoc,
      action: 'change_email',
      context: ctx,
      mode: 'framework',
    })
    expect(probRes.allowed).toBe(false)
    expect(store.auditLogs.some((l) => l.eventType === 'PROBATION_ACTION_BLOCKED')).toBe(true)
  })

  it('guards admin security dashboard and restricts /attacks scripts to localhost', async () => {
    const { GET: getDashboard } = await import('@/app/api/security/dashboard/route')
    const unauthRes = await getDashboard(new NextRequest('http://localhost:3000/api/security/dashboard'))
    expect(unauthRes.status).toBe(401)

    expect(assertLocalTarget('http://localhost:3000')).toBe('http://localhost:3000')
    expect(() => assertLocalTarget('https://evil-target.com')).toThrow(/SAFETY BLOCK/)
  })
})
