import type { NextRequest } from 'next/server'
import { cookies, headers } from 'next/headers'
import { sha256 } from './crypto'

export interface RequestContext {
  ip: string
  location: string
  userAgent: string
  deviceFingerprint: string
  deviceLabel: string
}

export const DEVICE_COOKIE_NAME = 'sr_device_id'

function parseDeviceLabel(ua: string): string {
  const lower = ua.toLowerCase()
  let os = 'Unknown OS'
  if (lower.includes('mac os') || lower.includes('macintosh')) os = 'macOS'
  else if (lower.includes('windows')) os = 'Windows'
  else if (lower.includes('linux')) os = 'Linux'
  else if (lower.includes('iphone') || lower.includes('ipad')) os = 'iOS'
  else if (lower.includes('android')) os = 'Android'

  let browser = 'Browser'
  if (lower.includes('edg/')) browser = 'Edge'
  else if (lower.includes('chrome/') && !lower.includes('edg/')) browser = 'Chrome'
  else if (lower.includes('firefox/')) browser = 'Firefox'
  else if (lower.includes('safari/') && !lower.includes('chrome/')) browser = 'Safari'
  else if (lower.includes('curl') || lower.includes('node')) browser = 'Automated Client'

  return `${browser} on ${os}`
}

function normalizeIp(rawIp: string | null): string {
  if (!rawIp) return '127.0.0.1'
  const first = rawIp.split(',')[0]?.trim() || '127.0.0.1'
  if (first === '::1') return '127.0.0.1'
  return first.replace(/^::ffff:/, '')
}

export function extractContextFromHeaders(
  hdrs: Headers,
  deviceCookieValue?: string
): RequestContext {
  // Demo simulation headers allow capstone evaluators to test foreign IPs, locations, or unknown devices
  const demoIp = hdrs.get('x-demo-ip')
  const demoLocation = hdrs.get('x-demo-location')
  const demoDevice = hdrs.get('x-demo-device')

  const forwarded = hdrs.get('x-forwarded-for')
  const realIp = hdrs.get('x-real-ip')
  const ip = normalizeIp(demoIp || forwarded || realIp)

  const userAgent = hdrs.get('user-agent') || 'Unknown-UA'
  const acceptLang = hdrs.get('accept-language') || 'en-US'
  const city = hdrs.get('x-vercel-ip-city')
  const country = hdrs.get('x-vercel-ip-country')
  const derivedLocation =
    demoLocation ||
    (city && country ? `${city}, ${country}` : country || (ip === '127.0.0.1' ? 'Localhost (Trusted Lab)' : 'Unknown Region'))

  const seed = demoDevice
    ? `demo:${demoDevice}`
    : `${deviceCookieValue || 'anon'}|${userAgent}|${acceptLang}`

  const deviceFingerprint = sha256(seed).slice(0, 24)
  const deviceLabel = demoDevice ? `Simulated: ${demoDevice}` : parseDeviceLabel(userAgent)

  return {
    ip,
    location: derivedLocation,
    userAgent,
    deviceFingerprint,
    deviceLabel,
  }
}

export function getRequestContext(req: NextRequest): RequestContext {
  const cookieVal = req.cookies.get(DEVICE_COOKIE_NAME)?.value
  return extractContextFromHeaders(req.headers, cookieVal)
}

export async function getServerActionContext(): Promise<RequestContext> {
  const hdrs = await headers()
  const cookieStore = await cookies()
  const cookieVal = cookieStore.get(DEVICE_COOKIE_NAME)?.value
  return extractContextFromHeaders(hdrs, cookieVal)
}
