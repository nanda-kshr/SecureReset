export interface DemoOriginProfile {
  id: 'trusted' | 'foreign' | 'hijack'
  label: string
  ip?: string
  location?: string
  device?: string
}

export const DEMO_ORIGIN_PROFILES: DemoOriginProfile[] = [
  { id: 'trusted', label: 'Current Browser (Trusted Baseline)' },
  {
    id: 'foreign',
    label: 'Simulated Unusual Origin (Frankfurt, DE · 185.220.101.42)',
    ip: '185.220.101.42',
    location: 'Frankfurt, DE',
    device: 'unknown-linux-firefox',
  },
  {
    id: 'hijack',
    label: 'Simulated Hijack Device (Moscow, RU · 91.108.56.11)',
    ip: '91.108.56.11',
    location: 'Moscow, RU',
    device: 'attacker-device-99',
  },
]

const STORAGE_KEY = 'sr_demo_origin'

export function getSavedDemoOrigin(): DemoOriginProfile {
  if (typeof window === 'undefined') return DEMO_ORIGIN_PROFILES[0]
  const id = window.sessionStorage.getItem(STORAGE_KEY)
  return DEMO_ORIGIN_PROFILES.find((p) => p.id === id) || DEMO_ORIGIN_PROFILES[0]
}

export function setSavedDemoOrigin(id: DemoOriginProfile['id']) {
  if (typeof window === 'undefined') return
  window.sessionStorage.setItem(STORAGE_KEY, id)
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : null
}

export async function ensureCsrfToken(): Promise<string> {
  const existing = readCookie('sr_csrf')
  if (existing) return existing
  const res = await fetch('/api/auth/csrf', { credentials: 'include' })
  const data = await res.json()
  return data.csrfToken
}

export async function secureFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const method = (options.method || 'GET').toUpperCase()
  const headers = new Headers(options.headers || {})

  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json')
  }

  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    const csrf = await ensureCsrfToken()
    headers.set('x-csrf-token', csrf)
  }

  const origin = getSavedDemoOrigin()
  if (origin.id !== 'trusted') {
    if (origin.ip) headers.set('x-demo-ip', origin.ip)
    if (origin.location) headers.set('x-demo-location', origin.location)
    if (origin.device) headers.set('x-demo-device', origin.device)
  }

  return fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  })
}
