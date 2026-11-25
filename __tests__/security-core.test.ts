import { describe, expect, it, vi, afterEach } from 'vitest'
import speakeasy from 'speakeasy'
import {
  generateOtp,
  generateRandomToken,
  hashPassword,
  sha256,
  signHmac,
  verifyHmac,
  verifyPassword,
} from '@/lib/security/crypto'
import { assessResetRisk } from '@/lib/security/risk'
import { validateNewPassword } from '@/lib/security/password'
import { generateCsrfToken, isValidCsrfToken } from '@/lib/security/csrf'
import { verifyTotpCode } from '@/lib/security/totp'
import type { UserDoc } from '@/lib/db/mongodb'

describe('Security Core Primitives', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('generates 256-bit hex tokens, 6-digit OTPs, and valid HMAC signatures', () => {
    const token = generateRandomToken(32)
    expect(token).toMatch(/^[a-f0-9]{64}$/)

    const otp = generateOtp()
    expect(otp).toMatch(/^\d{6}$/)
    expect(sha256(token)).toHaveLength(64)

    const sig = signHmac('payload-123', 'test-secret-32-chars-minimum-length')
    expect(verifyHmac('payload-123', sig, 'test-secret-32-chars-minimum-length')).toBe(true)
    expect(verifyHmac('payload-tampered', sig, 'test-secret-32-chars-minimum-length')).toBe(false)
  })

  it('validates CSRF token signature', () => {
    const token = generateCsrfToken()
    expect(isValidCsrfToken(token)).toBe(true)
    expect(isValidCsrfToken(`${token}tampered`)).toBe(false)
    expect(isValidCsrfToken(undefined)).toBe(false)
  })

  it('computes low, medium, and high risk levels with step-up escalation', () => {
    const baseUser: UserDoc = {
      name: 'Alice',
      email: 'alice@example.com',
      passwordHash: 'hash',
      passwordHistory: [],
      role: 'user',
      totpEnabled: true,
      totpSecret: 'JBSWY3DPEHPK3PXP',
      securityQuestion: { question: 'School?', answerHash: 'hash' },
      knownDevices: [
        {
          fingerprint: 'trusted-fp',
          label: 'Chrome on macOS',
          ip: '10.0.0.5',
          location: 'Bengaluru, IN',
          lastSeenAt: new Date(),
        },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const low = assessResetRisk({
      user: baseUser,
      context: {
        deviceFingerprint: 'trusted-fp',
        deviceLabel: 'Chrome on macOS',
        ip: '10.0.0.5',
        location: 'Bengaluru, IN',
        userAgent: 'Mozilla',
      },
    })
    expect(low.level).toBe('low')
    expect(low.score).toBe(0)
    expect(low.extraCheckRequired).toBe('none')

    const medium = assessResetRisk({
      user: baseUser,
      context: {
        deviceFingerprint: 'new-fp',
        deviceLabel: 'Firefox on macOS',
        ip: '10.0.0.5',
        location: 'Bengaluru, IN',
        userAgent: 'Mozilla',
      },
    })
    expect(medium.level).toBe('medium')
    expect(medium.extraCheckRequired).toBe('security_question')

    const high = assessResetRisk({
      user: baseUser,
      context: {
        deviceFingerprint: 'attacker-fp',
        deviceLabel: 'Kali',
        ip: '185.220.101.42',
        location: 'Moscow, RU',
        userAgent: 'curl',
      },
      recentFailedAttempts: 3,
    })
    expect(high.level).toBe('high')
    expect(high.score).toBeGreaterThanOrEqual(65)
    expect(high.extraCheckRequired).toBe('both')
  })

  it('enforces zxcvbn strength, HIBP k-anonymity check, and password history reuse', async () => {
    const oldHash = await hashPassword('Correct-Horse-Battery-Staple-99!')
    expect(await verifyPassword('Correct-Horse-Battery-Staple-99!', oldHash)).toBe(true)

    // Mock HIBP range response for SHA1("Unique-Strong-Passphrase-2026!") -> not present
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('00000000000000000000000000000000000:5\n', { status: 200 })
    )

    const weakRes = await validateNewPassword('123456', [oldHash])
    expect(weakRes.valid).toBe(false)
    expect(weakRes.score).toBeLessThan(3)

    const reusedRes = await validateNewPassword('Correct-Horse-Battery-Staple-99!', [oldHash])
    expect(reusedRes.valid).toBe(false)
    expect(reusedRes.reused).toBe(true)

    const strongRes = await validateNewPassword('Nebula-Quantum-Anchor-742!', [oldHash])
    expect(strongRes.valid).toBe(true)
    expect(strongRes.breached).toBe(false)
    expect(strongRes.reused).toBe(false)
  })

  it('verifies valid and invalid RFC 6238 TOTP codes', () => {
    const secret = 'JBSWY3DPEHPK3PXP'
    const validCode = speakeasy.totp({ secret, encoding: 'base32' })
    expect(verifyTotpCode(secret, validCode)).toBe(true)
    expect(verifyTotpCode(secret, '000000')).toBe(false)
  })
})
