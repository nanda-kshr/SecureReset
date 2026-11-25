import { NextRequest, NextResponse } from 'next/server'
import { verifyRequestCsrf } from './csrf'

export function requireCsrf(req: NextRequest): NextResponse | null {
  if (!verifyRequestCsrf(req)) {
    return NextResponse.json(
      {
        error: 'Invalid or missing CSRF token. Refresh the page and try again.',
        code: 'CSRF_INVALID',
      },
      { status: 403 }
    )
  }
  return null
}

export function jsonError(message: string, status = 400, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error: message, ...extra }, { status })
}
