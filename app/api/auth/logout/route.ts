import { NextRequest, NextResponse } from 'next/server'
import { requireCsrf } from '@/lib/security/api-guard'
import { revokeSessionByRawToken, SESSION_COOKIE_NAME } from '@/lib/security/session'

export async function POST(req: NextRequest) {
  const csrfError = requireCsrf(req)
  if (csrfError) return csrfError

  const rawToken = req.cookies.get(SESSION_COOKIE_NAME)?.value
  if (rawToken) {
    await revokeSessionByRawToken(rawToken)
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.delete(SESSION_COOKIE_NAME)
  return res
}
