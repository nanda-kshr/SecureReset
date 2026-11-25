import type { UserDoc } from '@/lib/db/mongodb'
import type { RequestContext } from '@/lib/security/request-context'
import { AuthStrengthTier, CurveShape, RECOVERY_CONFIG } from './config'

export interface AssuranceSignalsInput {
  user: UserDoc
  context: RequestContext
  browserKeyValid: boolean
  recoveryCodeValid: boolean
  recentFailedAttempts: number
  recentResetRequests: number
  now?: Date
}

export interface AssuranceBreakdown {
  strongestMethod: AuthStrengthTier
  assuranceRequired: number
  assuranceAchieved: number
  scoreGap: number
  delayHours: number
  curveShape: CurveShape
  signals: {
    browserKeyValid: boolean
    knownDeviceMatch: boolean
    knownIpMatch: boolean
    knownAsnMatch: boolean
    knownGeoMatch: boolean
    recoveryCodeValid: boolean
    recentFailedAttempts: number
    recentResetRequests: number
    recentSecurityChange: boolean
  }
  reasons: string[]
}

export function getStrongestLoginMethod(user: UserDoc): AuthStrengthTier {
  if ((user.passkeysCount ?? 0) > 0) return 'passkey'
  if (user.totpEnabled && user.totpSecret) return 'totp'
  return 'password'
}

export function mapGapToDelayHours(
  gap: number,
  shape: CurveShape = RECOVERY_CONFIG.assurance.curveShape
): number {
  const clampedGap = Math.max(0, Math.min(100, gap))
  if (clampedGap <= 0) return 0

  if (shape === 'logistic') {
    const { midpointGap, steepness, maxHours } = RECOVERY_CONFIG.assurance.logistic
    const raw = 1 / (1 + Math.exp(-steepness * (clampedGap - midpointGap)))
    const zeroOffset = 1 / (1 + Math.exp(-steepness * (0 - midpointGap)))
    const normalized = Math.max(0, (raw - zeroOffset) / (1 - zeroOffset))
    return Number((normalized * maxHours).toFixed(2))
  }

  // Piecewise-linear interpolation across configured breakpoints
  const pts = RECOVERY_CONFIG.assurance.piecewiseBreakpoints
  if (clampedGap >= pts[pts.length - 1].gap) {
    return pts[pts.length - 1].hours
  }

  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]
    const b = pts[i + 1]
    if (clampedGap >= a.gap && clampedGap <= b.gap) {
      const ratio = (clampedGap - a.gap) / (b.gap - a.gap)
      return Number((a.hours + ratio * (b.hours - a.hours)).toFixed(2))
    }
  }

  return RECOVERY_CONFIG.assurance.maxDelayHours
}

export function computeAssuranceAssessment(input: AssuranceSignalsInput): AssuranceBreakdown {
  const {
    user,
    context,
    browserKeyValid,
    recoveryCodeValid,
    recentFailedAttempts,
    recentResetRequests,
    now = new Date(),
  } = input

  const cfg = RECOVERY_CONFIG.assurance
  const strongestMethod = getStrongestLoginMethod(user)
  const assuranceRequired = cfg.requiredByMethod[strongestMethod]

  const knownDevices = user.knownDevices || []
  const knownDeviceMatch = knownDevices.some((d) => d.fingerprint === context.deviceFingerprint)
  const knownIpMatch = knownDevices.some((d) => d.ip === context.ip)
  const knownAsnMatch = Boolean(
    context.asn && knownDevices.some((d) => d.asn && d.asn === context.asn)
  )
  const knownGeoMatch = knownDevices.some(
    (d) => d.location.toLowerCase() === context.location.toLowerCase()
  )

  const changeWindowMs = cfg.signals.recentSecurityChangeWindowDays * 24 * 60 * 60 * 1000
  const recentSecurityChange = Boolean(
    user.lastSecurityChangeAt && now.getTime() - user.lastSecurityChangeAt.getTime() < changeWindowMs
  )

  let score = 0
  const reasons: string[] = []

  if (browserKeyValid) {
    score += cfg.signals.trustedBrowserKeyValid
    reasons.push(`Valid trusted browser ECDSA P-256 signature (+${cfg.signals.trustedBrowserKeyValid})`)
  } else {
    reasons.push('No valid trusted browser key signature (+0)')
  }

  if (knownDeviceMatch) {
    score += cfg.signals.knownDeviceMatch
    reasons.push(`Recognized device fingerprint (+${cfg.signals.knownDeviceMatch})`)
  }
  if (knownIpMatch) {
    score += cfg.signals.knownIpMatch
    reasons.push(`Familiar IP address (+${cfg.signals.knownIpMatch})`)
  }
  if (knownAsnMatch) {
    score += cfg.signals.knownAsnMatch
    reasons.push(`Familiar ASN (+${cfg.signals.knownAsnMatch})`)
  }
  if (knownGeoMatch) {
    score += cfg.signals.knownGeoMatch
    reasons.push(`Familiar location (+${cfg.signals.knownGeoMatch})`)
  }

  if (recoveryCodeValid) {
    score += cfg.signals.recoveryCodeValid
    reasons.push(`Unused recovery code verified (+${cfg.signals.recoveryCodeValid})`)
  }

  if (recentFailedAttempts > 0) {
    const penalty = Math.max(
      cfg.signals.penaltyRecentFailureCap,
      recentFailedAttempts * cfg.signals.penaltyRecentFailurePerEvent
    )
    score += penalty
    reasons.push(`Recent failed attempts (${recentFailedAttempts}) (${penalty})`)
  }

  if (recentResetRequests > 1) {
    const penalty = Math.max(
      cfg.signals.penaltyRecentResetCap,
      (recentResetRequests - 1) * cfg.signals.penaltyRecentResetPerEvent
    )
    score += penalty
    reasons.push(`Multiple recent reset requests (${recentResetRequests}) (${penalty})`)
  }

  if (recentSecurityChange) {
    score += cfg.signals.penaltyRecentSecurityChange
    reasons.push(
      `Recent account email/password/MFA change (${cfg.signals.penaltyRecentSecurityChange})`
    )
  }

  const assuranceAchieved = Math.max(0, Math.min(100, score))
  const scoreGap = Math.max(0, assuranceRequired - assuranceAchieved)
  const delayHours = mapGapToDelayHours(scoreGap, cfg.curveShape)

  return {
    strongestMethod,
    assuranceRequired,
    assuranceAchieved,
    scoreGap,
    delayHours,
    curveShape: cfg.curveShape,
    signals: {
      browserKeyValid,
      knownDeviceMatch,
      knownIpMatch,
      knownAsnMatch,
      knownGeoMatch,
      recoveryCodeValid,
      recentFailedAttempts,
      recentResetRequests,
      recentSecurityChange,
    },
    reasons,
  }
}

export function sampleDelayCurve(shape: CurveShape) {
  const points: Array<{ gap: number; hours: number }> = []
  for (let gap = 0; gap <= 100; gap += 10) {
    points.push({ gap, hours: mapGapToDelayHours(gap, shape) })
  }
  return points
}
