import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const NO_REFERRER_PREFIXES = ['/reset-password', '/veto', '/recovery-status', '/api/auth/reset', '/api/auth/veto']

export function proxy(request: NextRequest) {
  const response = NextResponse.next()
  const isDev = process.env.NODE_ENV === 'development'
  const path = request.nextUrl.pathname

  const referrerPolicy = NO_REFERRER_PREFIXES.some((prefix) => path.startsWith(prefix))
    ? 'no-referrer'
    : 'strict-origin-when-cross-origin'

  // Strict CSP compatible with Next.js static shell & WebCrypto browser-bound keys.
  // Note: extractable:false WebCrypto keys cannot be exported, yet an XSS payload could still
  // invoke crypto.subtle.sign() as a signing oracle — strict CSP is a critical defense layer.
  const cspDirectives = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self' https://api.pwnedpasswords.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isDev ? [] : ['upgrade-insecure-requests']),
  ].join('; ')

  response.headers.set('Content-Security-Policy', cspDirectives)
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('Referrer-Policy', referrerPolicy)
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  response.headers.set('X-XSS-Protection', '1; mode=block')

  if (!isDev) {
    response.headers.set(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains; preload'
    )
  }

  // Ensure every visitor gets a persistent device correlation cookie for device-familiarity checks
  if (!request.cookies.get('sr_device_id')?.value) {
    const deviceId = crypto.randomUUID()
    response.cookies.set('sr_device_id', deviceId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: !isDev,
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
    })
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
