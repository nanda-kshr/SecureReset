import type { NextRequest } from 'next/server'

export type ResetMode = 'naive' | 'standard' | 'framework'
export type CurveShape = 'piecewise-linear' | 'logistic'
export type AuthStrengthTier = 'password' | 'totp' | 'passkey'

/**
 * Single centralized configuration for the Recovery Assurance Framework.
 * All assurance weights, thresholds, delay curves, TTLs, and probation parameters
 * live here so experimental evaluations can tune them in one place.
 */
export const RECOVERY_CONFIG = {
  defaultMode: (process.env.RESET_MODE as ResetMode) || 'framework',

  /** Fixed base URL used for reset/veto links; never derived from Host / X-Forwarded-Host. */
  getBaseUrl(): string {
    const raw =
      process.env.APP_BASE_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      'https://secure-reset.vercel.app'
    const cleaned = raw.replace(/\/+$/, '')
    const isLocalHttp =
      cleaned.startsWith('http://localhost') ||
      cleaned.startsWith('http://127.0.0.1') ||
      cleaned.startsWith('http://[::1]')
    if (!cleaned.startsWith('https://') && !isLocalHttp) {
      throw new Error('APP_BASE_URL must use https:// (except localhost test targets).')
    }
    return cleaned
  },

  tokens: {
    resetByteLength: 32, // 256 bits CSPRNG
    resetTtlMinutes: 15,
    otpDigits: 6,
    otpMaxAttempts: 5,
    otpLockoutMinutes: 15,
    captchaThreshold: 2,
    vetoTtlHours: 72,
    recoveryCodeCount: 6,
    recoveryCodeByteLength: 10, // 80-bit random recovery codes (>= 64-bit requirement)
    challengeByteLength: 32,
  },

  rateLimits: {
    windowMs: 15 * 60 * 1000,
    resetPerIpMax: 12,
    resetPerAccountMax: 5,
    loginPerIpAccountMax: 10,
  },

  // TODO(NIST-SP-800-63B-4): Verify exact normative lockout thresholds, authenticator
  // assurance level (AAL) mappings, and password minimum/maximum length requirements
  // against the published NIST SP 800-63B-4 text before formal compliance sign-off.
  passwordPolicy: {
    minLength: 10,
    maxLength: 128,
    minZxcvbnScore: 3,
    historyLength: 5,
  },

  probation: {
    durationHours: 48,
  },

  assurance: {
    requiredByMethod: {
      password: 50,
      totp: 75,
      passkey: 90,
    } satisfies Record<AuthStrengthTier, number>,

    signals: {
      trustedBrowserKeyValid: 40,
      knownDeviceMatch: 20,
      knownIpMatch: 10,
      knownAsnMatch: 5,
      knownGeoMatch: 10,
      recoveryCodeValid: 35,
      penaltyRecentFailurePerEvent: -10,
      penaltyRecentFailureCap: -25,
      penaltyRecentResetPerEvent: -8,
      penaltyRecentResetCap: -20,
      penaltyRecentSecurityChange: -20,
      recentSecurityChangeWindowDays: 7,
    },

    curveShape: ((process.env.COOLING_CURVE_SHAPE as CurveShape) || 'piecewise-linear') as CurveShape,
    maxDelayHours: 72,

    piecewiseBreakpoints: [
      { gap: 0, hours: 0 },
      { gap: 15, hours: 1 },
      { gap: 35, hours: 12 },
      { gap: 60, hours: 36 },
      { gap: 85, hours: 72 },
    ],

    logistic: {
      midpointGap: 40,
      steepness: 0.1,
      minHours: 0,
      maxHours: 72,
    },
  },
} as const

export function resolveResetMode(req?: NextRequest): ResetMode {
  const allowEvalHeader =
    process.env.ALLOW_EVAL_MODE_HEADER === 'true' || process.env.NODE_ENV !== 'production'
  if (req && allowEvalHeader) {
    const headerMode = req.headers.get('x-test-reset-mode')
    if (headerMode === 'naive' || headerMode === 'standard' || headerMode === 'framework') {
      return headerMode
    }
  }
  const envMode = process.env.RESET_MODE
  if (envMode === 'naive' || envMode === 'standard' || envMode === 'framework') {
    return envMode
  }
  return 'framework'
}
