import zxcvbn from 'zxcvbn'
import { sha1Upper, verifyPassword } from './crypto'
import { RECOVERY_CONFIG } from '@/lib/recovery/config'

const OFFLINE_COMMON_BREACHED = new Set([
  'password',
  'password123',
  '123456',
  '12345678',
  '123456789',
  'qwerty',
  'qwerty123',
  'letmein',
  'welcome',
  'admin',
  'admin123',
  'iloveyou',
  'monkey',
  'dragon',
  'football',
  'P@ssw0rd!',
  'Password123!',
])

export interface PasswordValidationResult {
  valid: boolean
  score: number
  cracksDisplay: string
  feedback: string[]
  breached: boolean
  breachCount: number
  breachSource: 'hibp' | 'offline-fallback'
  reused: boolean
  errors: string[]
}

export function checkPasswordStrength(password: string, userInputs: string[] = []) {
  const { minLength, minZxcvbnScore } = RECOVERY_CONFIG.passwordPolicy
  const result = zxcvbn(password, userInputs)
  const feedback: string[] = []
  if (result.feedback.warning) {
    feedback.push(result.feedback.warning)
  }
  for (const s of result.feedback.suggestions) {
    feedback.push(s)
  }
  return {
    score: result.score,
    cracksDisplay: String(result.crack_times_display.offline_slow_hashing_1e4_per_second),
    feedback,
    acceptable: result.score >= minZxcvbnScore && password.length >= minLength,
  }
}

export async function checkHibpBreach(password: string): Promise<{
  breached: boolean
  count: number
  source: 'hibp' | 'offline-fallback'
}> {
  const hash = sha1Upper(password)
  const prefix = hash.slice(0, 5)
  const suffix = hash.slice(5)

  try {
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: {
        'Add-Padding': 'true',
        'User-Agent': 'SecureReset-Capstone/1.0',
      },
      signal: AbortSignal.timeout(3000),
    })

    if (!res.ok) {
      throw new Error(`HIBP HTTP ${res.status}`)
    }

    const body = await res.text()
    const lines = body.split('\n')
    for (const line of lines) {
      const [candidateSuffix, countStr] = line.trim().split(':')
      if (candidateSuffix === suffix) {
        const count = Number.parseInt(countStr || '1', 10)
        if (count > 0) {
          return { breached: true, count, source: 'hibp' }
        }
      }
    }
    return { breached: false, count: 0, source: 'hibp' }
  } catch {
    const breached = OFFLINE_COMMON_BREACHED.has(password)
    return {
      breached,
      count: breached ? 100000 : 0,
      source: 'offline-fallback',
    }
  }
}

export async function isPasswordReused(
  candidatePassword: string,
  historyHashes: string[]
): Promise<boolean> {
  for (const oldHash of historyHashes) {
    if (await verifyPassword(candidatePassword, oldHash)) {
      return true
    }
  }
  return false
}

export async function validateNewPassword(
  password: string,
  historyHashes: string[] = [],
  userInputs: string[] = []
): Promise<PasswordValidationResult> {
  const { minLength, minZxcvbnScore } = RECOVERY_CONFIG.passwordPolicy
  const strength = checkPasswordStrength(password, userInputs)
  const [breach, reused] = await Promise.all([
    checkHibpBreach(password),
    isPasswordReused(password, historyHashes),
  ])

  const errors: string[] = []
  if (password.length < minLength) {
    errors.push(`Password must be at least ${minLength} characters long.`)
  }
  if (strength.score < minZxcvbnScore) {
    errors.push(
      `Password strength score is ${strength.score}/4 (must be at least ${minZxcvbnScore}/4). ${strength.feedback[0] || 'Add more unique words or symbols.'}`
    )
  }
  if (breach.breached) {
    errors.push(
      `This password appeared in ${breach.count.toLocaleString()} known data breaches (HIBP k-anonymity check). Choose a unique password.`
    )
  }
  if (reused) {
    errors.push('Cannot reuse your current or recent passwords.')
  }

  return {
    valid: errors.length === 0,
    score: strength.score,
    cracksDisplay: strength.cracksDisplay,
    feedback: strength.feedback,
    breached: breach.breached,
    breachCount: breach.count,
    breachSource: breach.source,
    reused,
    errors,
  }
}
