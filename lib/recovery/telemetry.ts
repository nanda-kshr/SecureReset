import { getCollections } from '@/lib/db/mongodb'
import { pseudonymizeId } from '@/lib/security/crypto'
import type { ResetMode } from './config'
import type { ResetState } from './state-machine'

export type TelemetryActorType = 'attacker' | 'legitimate' | 'unknown'

export interface EmitTelemetryInput {
  mode: ResetMode
  eventType: string
  state: ResetState | 'none'
  accountId?: string
  signals?: Record<string, unknown>
  assuranceAchieved?: number
  assuranceRequired?: number
  scoreGap?: number
  computedDelayHours?: number
  outcome: 'allowed' | 'blocked' | 'pending' | 'vetoed' | 'completed' | 'cancelled' | 'expired'
  actorType?: TelemetryActorType
}

/**
 * Emits structured PII-free JSON telemetry for experimental evaluation.
 * Account identifiers are HMAC-pseudonymized; raw emails, tokens, and OTPs are never logged.
 */
export async function emitTelemetry(input: EmitTelemetryInput): Promise<void> {
  const record = {
    timestamp: new Date(),
    mode: input.mode,
    eventType: input.eventType,
    state: input.state,
    accountHash: input.accountId ? pseudonymizeId(input.accountId) : 'anonymous',
    signals: input.signals ?? {},
    assuranceAchieved: input.assuranceAchieved ?? null,
    assuranceRequired: input.assuranceRequired ?? null,
    scoreGap: input.scoreGap ?? null,
    computedDelayHours: input.computedDelayHours ?? null,
    outcome: input.outcome,
    actorType: input.actorType ?? 'unknown',
  }

  if (process.env.STRUCTURED_TELEMETRY_STDOUT === 'true') {
    console.info(JSON.stringify({ ...record, timestamp: record.timestamp.toISOString() }))
  }

  try {
    const { telemetryEvents } = await getCollections()
    await telemetryEvents.insertOne(record)
  } catch (err) {
    console.error('Failed to persist telemetry event:', err)
  }
}
