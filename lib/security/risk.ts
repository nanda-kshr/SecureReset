import type { ExtraCheckType, RiskLevel, UserDoc } from '@/lib/db/mongodb'
import type { RequestContext } from './request-context'

export interface RiskAssessment {
  score: number
  level: RiskLevel
  factors: string[]
  extraCheckRequired: ExtraCheckType
}

export function assessResetRisk(params: {
  user: UserDoc
  context: RequestContext
  recentFailedAttempts?: number
}): RiskAssessment {
  const { user, context, recentFailedAttempts = 0 } = params
  const knownDevices = user.knownDevices || []

  let score = 0
  const factors: string[] = []

  const knownDeviceMatch = knownDevices.some((d) => d.fingerprint === context.deviceFingerprint)
  const knownIpMatch = knownDevices.some((d) => d.ip === context.ip)
  const knownLocationMatch = knownDevices.some(
    (d) => d.location.toLowerCase() === context.location.toLowerCase()
  )

  if (knownDevices.length === 0) {
    score += 20
    factors.push('No prior trusted device baseline recorded (+20)')
  } else {
    if (!knownDeviceMatch) {
      score += 35
      factors.push(`Unrecognized device fingerprint (${context.deviceLabel}) (+35)`)
    }
    if (!knownIpMatch) {
      score += 25
      factors.push(`New IP address (${context.ip}) (+25)`)
    }
    if (!knownLocationMatch) {
      score += 30
      factors.push(`Unusual location (${context.location}) (+30)`)
    }
  }

  if (recentFailedAttempts >= 2) {
    score += 20
    factors.push(`Recent failed authentication/reset attempts (${recentFailedAttempts}) (+20)`)
  }

  if (factors.length === 0) {
    factors.push('Matched known trusted device, IP, and location (0)')
  }

  const clampedScore = Math.min(100, score)
  let level: RiskLevel = 'low'
  if (clampedScore >= 65) {
    level = 'high'
  } else if (clampedScore >= 30) {
    level = 'medium'
  }

  const hasSecQ = Boolean(user.securityQuestion?.answerHash)
  const hasTotp = Boolean(user.totpEnabled && user.totpSecret)

  let extraCheckRequired: ExtraCheckType = 'none'
  if (level === 'medium') {
    if (hasSecQ) extraCheckRequired = 'security_question'
    else if (hasTotp) extraCheckRequired = 'totp'
  } else if (level === 'high') {
    if (hasTotp && hasSecQ) extraCheckRequired = 'both'
    else if (hasTotp) extraCheckRequired = 'totp'
    else if (hasSecQ) extraCheckRequired = 'security_question'
  }

  return {
    score: clampedScore,
    level,
    factors,
    extraCheckRequired,
  }
}
