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
