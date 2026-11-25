import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'

const BCRYPT_ROUNDS = 12

export function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex')
}

export function sha1Upper(value: string): string {
  return crypto.createHash('sha1').update(value).digest('hex').toUpperCase()
}

export function generateRandomToken(byteLength = 32): string {
  return crypto.randomBytes(byteLength).toString('hex')
}

export function generateOtp(): string {
  return crypto.randomInt(100000, 1000000).toString()
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS)
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash)
}

export function getEnvSecret(name: 'SESSION_SECRET' | 'CSRF_SECRET' | 'CAPTCHA_SECRET'): string {
  const value = process.env[name]
  if (value && value.length >= 32) {
    return value
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error(`Missing or weak ${name} environment variable`)
  }
  return `dev-fallback-${name}-change-in-production-32bytes`
}

export function signHmac(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex')
}

export function verifyHmac(payload: string, signature: string, secret: string): boolean {
  const expected = signHmac(payload, secret)
  const expectedBuf = Buffer.from(expected, 'utf8')
  const actualBuf = Buffer.from(signature, 'utf8')
  if (expectedBuf.length !== actualBuf.length) {
    return false
  }
  return crypto.timingSafeEqual(expectedBuf, actualBuf)
}

/**
 * Per-token salted HMAC-SHA256 for 6-digit OTPs so an offline DB dump
 * cannot precompute a lookup table of 10^6 OTPs.
 */
export function hashOtp(otp: string, salt: string): string {
  return signHmac(`${salt}:${otp}`, getEnvSecret('SESSION_SECRET'))
}

export function verifyOtpHash(otp: string, salt: string, expectedHash: string): boolean {
  return verifyHmac(`${salt}:${otp}`, expectedHash, getEnvSecret('SESSION_SECRET'))
}

/**
 * Generates an 80-bit (>= 64-bit) recovery code formatted into 4-char hex blocks.
 */
export function generateRecoveryCode(): string {
  const raw = crypto.randomBytes(10).toString('hex').toUpperCase()
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}`
}

export function hashRecoveryCode(code: string): string {
  const normalized = code.replace(/[-\s]/g, '').toUpperCase()
  return signHmac(`recovery:${normalized}`, getEnvSecret('SESSION_SECRET'))
}

export function verifyRecoveryCodeHash(code: string, expectedHash: string): boolean {
  const normalized = code.replace(/[-\s]/g, '').toUpperCase()
  return verifyHmac(`recovery:${normalized}`, expectedHash, getEnvSecret('SESSION_SECRET'))
}

/**
 * Verifies a WebCrypto ECDSA P-256 signature over a challenge nonce.
 * WebCrypto emits IEEE P1363 (r || s, 64 bytes) signatures, so we specify dsaEncoding: 'ieee-p1363'.
 */
export function verifyBrowserKeySignature(
  publicKeyJwk: JsonWebKey,
  challengeNonce: string,
  signatureBase64: string
): boolean {
  try {
    const keyObject = crypto.createPublicKey({
      key: publicKeyJwk as crypto.JsonWebKey,
      format: 'jwk',
    })
    const sigBuf = Buffer.from(signatureBase64, 'base64')
    return crypto.verify(
      'sha256',
      Buffer.from(challengeNonce, 'utf8'),
      { key: keyObject, dsaEncoding: 'ieee-p1363' },
      sigBuf
    )
  } catch {
    return false
  }
}

export function pseudonymizeId(value: string): string {
  return signHmac(value.toLowerCase(), getEnvSecret('SESSION_SECRET')).slice(0, 16)
}

export function maskEmailForDisplay(email: string): string {
  const [local, domain] = email.split('@')
  if (!local || !domain) return '***'
  return `${local.slice(0, 2)}***@${domain}`
}
