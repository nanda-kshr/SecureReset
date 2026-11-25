import crypto from 'node:crypto'
import type { NextRequest } from 'next/server'
import { getEnvSecret, signHmac, verifyHmac } from './crypto'

export const CSRF_COOKIE_NAME = 'sr_csrf'
export const CSRF_HEADER_NAME = 'x-csrf-token'

export function generateCsrfToken(): string {
  const nonce = crypto.randomBytes(24).toString('hex')
  const sig = signHmac(nonce, getEnvSecret('CSRF_SECRET'))
  return `${nonce}.${sig}`
}

export function isValidCsrfToken(token: string | undefined | null): boolean {
  if (!token) return false
  const parts = token.split('.')
  if (parts.length !== 2) return false
  const [nonce, sig] = parts
  if (!nonce || !sig) return false
  return verifyHmac(nonce, sig, getEnvSecret('CSRF_SECRET'))
}

export function verifyRequestCsrf(req: NextRequest): boolean {
  const cookieToken = req.cookies.get(CSRF_COOKIE_NAME)?.value
  const headerToken = req.headers.get(CSRF_HEADER_NAME)
  if (!cookieToken || !headerToken) return false
  if (cookieToken !== headerToken) return false
  return isValidCsrfToken(headerToken)
}
