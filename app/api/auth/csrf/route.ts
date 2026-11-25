import { NextRequest, NextResponse } from 'next/server'
import { CSRF_COOKIE_NAME, generateCsrfToken, isValidCsrfToken } from '@/lib/security/csrf'
import { DEVICE_COOKIE_NAME } from '@/lib/security/request-context'
import crypto from 'node:crypto'

export async function GET(req: NextRequest) {
  const existing = req.cookies.get(CSRF_COOKIE_NAME)?.value
  const csrfToken = isValidCsrfToken(existing) ? existing! : generateCsrfToken()
  const res = NextResponse.json({ csrfToken })

  res.cookies.set(CSRF_COOKIE_NAME, csrfToken, {
    httpOnly: false,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 12,
  })

  if (!req.cookies.get(DEVICE_COOKIE_NAME)?.value) {
    res.cookies.set(DEVICE_COOKIE_NAME, crypto.randomUUID(), {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
    })
  }

  return res
}
