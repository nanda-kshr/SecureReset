import { getCollections, UserDoc } from '@/lib/db/mongodb'
import { logAuditEvent } from '@/lib/security/audit'
import type { RequestContext } from '@/lib/security/request-context'
import { emitTelemetry } from './telemetry'
import { RECOVERY_CONFIG, ResetMode } from './config'

export type SensitiveAction =
  | 'change_email'
  | 'change_mfa'
  | 'add_trusted_key_or_passkey'
  | 'change_recovery_settings'
  | 'export_data'
  | 'create_api_key'

export interface ProbationCheckResult {
  allowed: boolean
  unlocksAt?: string
  message?: string
}

/**
 * Central post-reset probation policy guard.
 * Blocks high-risk account mutations for `probationUntil` (default 48h after reset)
 * unless approved by a pre-reset already-trusted session (marked `session.trustedBeforeReset`).
 */
export async function enforcePostResetProbation(params: {
  user: UserDoc
  action: SensitiveAction
  context: RequestContext
  mode?: ResetMode
  sessionCreatedAt?: Date
  now?: Date
}): Promise<ProbationCheckResult> {
  const { user, action, context, mode = RECOVERY_CONFIG.defaultMode, sessionCreatedAt, now = new Date() } = params

  if (mode !== 'framework') {
    return { allowed: true }
  }

  const probationUntil = user.probationUntil
  if (!probationUntil || probationUntil <= now) {
    return { allowed: true }
  }

  // If the session was established BEFORE the probation period started (i.e. an already-trusted
  // pre-reset session that survived or was explicitly trusted), allow; new post-reset sessions wait.
  const probationStartApprox = new Date(
    probationUntil.getTime() - RECOVERY_CONFIG.probation.durationHours * 3600 * 1000
  )
  if (sessionCreatedAt && sessionCreatedAt < probationStartApprox) {
    return { allowed: true }
  }

  const unlocksAt = probationUntil.toISOString()
  const message = `Action "${action.replace(/_/g, ' ')}" is blocked during post-reset security probation. It unlocks on ${probationUntil.toUTCString()}.`

  await logAuditEvent({
    eventType: 'PROBATION_ACTION_BLOCKED',
    severity: 'blocked',
    blocked: true,
    email: user.email,
    userId: user._id ?? null,
    context,
    details: { action, unlocksAt },
  })

  await emitTelemetry({
    mode,
    eventType: 'PROBATION_ACTION_BLOCKED',
    state: 'completed',
    accountId: user._id?.toString() || user.email,
    outcome: 'blocked',
    actorType: 'unknown',
    signals: { action },
  })

  return { allowed: false, unlocksAt, message }
}

export async function clearExpiredProbationIfNeeded(user: UserDoc): Promise<void> {
  if (user.probationUntil && user.probationUntil <= new Date()) {
    const { users } = await getCollections()
    await users.updateOne({ _id: user._id }, { $set: { probationUntil: null } })
  }
}
