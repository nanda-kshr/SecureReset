import { MongoClient, Db, Collection, ObjectId } from 'mongodb'
import type { ResetMode } from '@/lib/recovery/config'
import type { ResetState } from '@/lib/recovery/state-machine'
import type { TelemetryActorType } from '@/lib/recovery/telemetry'

export interface KnownDevice {
  fingerprint: string
  label: string
  ip: string
  asn?: string
  location: string
  lastSeenAt: Date
}

export interface ConfirmedChannel {
  id: string
  type: 'email' | 'backup_email'
  value: string
  verified: boolean
  addedAt: Date
}

export interface TrustedBrowserKey {
  keyId: string
  label: string
  publicKeyJwk: JsonWebKey
  createdAt: Date
  lastUsedAt?: Date | null
  revokedAt?: Date | null
}

export interface RecoveryCodeRecord {
  id: string
  codeHash: string
  createdAt: Date
  usedAt?: Date | null
}

export interface UserDoc {
  _id?: ObjectId
  name: string
  email: string
  passwordHash: string
  passwordHistory: string[]
  role: 'user' | 'admin'
  totpEnabled: boolean
  totpSecret?: string | null
  totpPendingSecret?: string | null
  passkeysCount?: number
  securityQuestion?: {
    question: string
    answerHash: string
  } | null
  knownDevices: KnownDevice[]
  confirmedChannels?: ConfirmedChannel[]
  trustedBrowserKeys?: TrustedBrowserKey[]
  recoveryCodes?: RecoveryCodeRecord[]
  probationUntil?: Date | null
  flaggedSuspicious?: boolean
  flaggedReason?: string | null
  lastSecurityChangeAt?: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface SessionDoc {
  _id?: ObjectId
  userId: ObjectId
  tokenHash: string
  deviceFingerprint: string
  deviceLabel: string
  ip: string
  location: string
  userAgent: string
  createdAt: Date
  expiresAt: Date
  revokedAt: Date | null
}

export interface RefreshTokenDoc {
  _id?: ObjectId
  userId: ObjectId
  tokenHash: string
  createdAt: Date
  expiresAt: Date
  revokedAt: Date | null
}

export interface ApiKeyDoc {
  _id?: ObjectId
  userId: ObjectId
  name: string
  prefix: string
  keyHash: string
  createdAt: Date
  revokedAt: Date | null
}

export type RiskLevel = 'low' | 'medium' | 'high'
export type ExtraCheckType = 'none' | 'security_question' | 'totp' | 'both'

export interface ResetTokenDoc {
  _id?: ObjectId
  userId: ObjectId
  email: string
  tokenHash: string
  otpHash: string
  otpSalt?: string
  state?: ResetState
  mode?: ResetMode
  deviceFingerprint: string
  ip: string
  asn?: string
  location: string
  riskScore: number
  riskLevel: RiskLevel
  riskFactors: string[]
  assuranceRequired?: number
  assuranceAchieved?: number
  scoreGap?: number
  coolingOffHours?: number
  completesAt?: Date | null
  vetoTokenHash?: string | null
  vetoExpiresAt?: Date | null
  vetoUsedAt?: Date | null
  challengeNonce?: string | null
  challengeExpiresAt?: Date | null
  browserKeyIdUsed?: string | null
  recoveryCodeUsed?: boolean
  extraCheckRequired: ExtraCheckType
  extraCheckPassed: boolean
  otpVerified: boolean
  otpAttempts: number
  lockedUntil: Date | null
  usedAt: Date | null
  expiresAt: Date
  actorType?: TelemetryActorType
  createdAt: Date
}

export interface RateLimitDoc {
  _id?: ObjectId
  key: string
  count: number
  consecutiveFailures: number
  windowStart: Date
  lockedUntil: Date | null
  updatedAt: Date
}

export interface UsedCaptchaDoc {
  _id?: ObjectId
  nonce: string
  expiresAt: Date
}

export type AuditSeverity = 'info' | 'warning' | 'blocked' | 'critical'

export interface AuditLogDoc {
  _id?: ObjectId
  eventType: string
  severity: AuditSeverity
  blocked: boolean
  email?: string
  userId?: ObjectId | null
  ip: string
  location: string
  deviceFingerprint: string
  userAgent: string
  riskLevel?: RiskLevel
  riskScore?: number
  details: Record<string, unknown>
  createdAt: Date
}

export interface EmailLogDoc {
  _id?: ObjectId
  to: string
  subject: string
  template: 'reset_instructions' | 'password_changed' | 'cooling_off_veto' | 'security_alert'
  status: 'sent' | 'failed'
  messageId?: string
  error?: string
  createdAt: Date
}

export interface TelemetryEventDoc {
  _id?: ObjectId
  timestamp: Date
  mode: ResetMode
  eventType: string
  state: ResetState | 'none'
  accountHash: string
  signals: Record<string, unknown>
  assuranceAchieved: number | null
  assuranceRequired: number | null
  scoreGap: number | null
  computedDelayHours: number | null
  outcome: string
  actorType: TelemetryActorType
}

declare global {
  var __mongoClientPromise: Promise<MongoClient> | undefined
  var __mongoIndexesEnsured: Promise<void> | undefined
}

function getMongoUri(): string {
  const uri = process.env.MONGODB_URI
  if (!uri) {
    throw new Error('MONGODB_URI environment variable is not configured.')
  }
  return uri
}

export async function getMongoClient(): Promise<MongoClient> {
  if (!globalThis.__mongoClientPromise) {
    const client = new MongoClient(getMongoUri(), {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 8000,
    })
    globalThis.__mongoClientPromise = client.connect()
  }
  return globalThis.__mongoClientPromise
}

export async function getDb(): Promise<Db> {
  const client = await getMongoClient()
  const dbName = process.env.MONGODB_DB || 'securereset'
  const db = client.db(dbName)
  await ensureIndexesAndMigrations(db)
  return db
}

async function ensureIndexesAndMigrations(db: Db): Promise<void> {
  if (!globalThis.__mongoIndexesEnsured) {
    globalThis.__mongoIndexesEnsured = (async () => {
      await Promise.all([
        db.collection('users').createIndex({ email: 1 }, { unique: true }),
        db.collection('sessions').createIndex({ tokenHash: 1 }, { unique: true }),
        db.collection('sessions').createIndex({ userId: 1, revokedAt: 1 }),
        db.collection('refresh_tokens').createIndex({ userId: 1, revokedAt: 1 }),
        db.collection('api_keys').createIndex({ userId: 1, revokedAt: 1 }),
        db.collection('reset_tokens').createIndex({ tokenHash: 1 }, { unique: true }),
        db.collection('reset_tokens').createIndex({ vetoTokenHash: 1 }, { sparse: true }),
        db.collection('reset_tokens').createIndex({ email: 1, createdAt: -1 }),
        db.collection('rate_limits').createIndex({ key: 1 }, { unique: true }),
        db.collection('used_captchas').createIndex({ nonce: 1 }, { unique: true }),
        db.collection('used_captchas').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
        db.collection('audit_logs').createIndex({ createdAt: -1 }),
        db.collection('audit_logs').createIndex({ blocked: 1, eventType: 1 }),
        db.collection('email_logs').createIndex({ createdAt: -1 }),
        db.collection('telemetry_events').createIndex({ timestamp: -1 }),
        db.collection('telemetry_events').createIndex({ mode: 1, actorType: 1 }),
      ])

      // Non-destructive additive backfill for legacy user records
      await db.collection('users').updateMany(
        { trustedBrowserKeys: { $exists: false } },
        {
          $set: {
            trustedBrowserKeys: [],
            recoveryCodes: [],
            passkeysCount: 0,
            probationUntil: null,
            flaggedSuspicious: false,
          },
        }
      )
    })().catch((err) => {
      globalThis.__mongoIndexesEnsured = undefined
      throw err
    })
  }
  return globalThis.__mongoIndexesEnsured
}

export async function getCollections() {
  const db = await getDb()
  return {
    db,
    users: db.collection<UserDoc>('users') as Collection<UserDoc>,
    sessions: db.collection<SessionDoc>('sessions') as Collection<SessionDoc>,
    refreshTokens: db.collection<RefreshTokenDoc>('refresh_tokens') as Collection<RefreshTokenDoc>,
    apiKeys: db.collection<ApiKeyDoc>('api_keys') as Collection<ApiKeyDoc>,
    resetTokens: db.collection<ResetTokenDoc>('reset_tokens') as Collection<ResetTokenDoc>,
    rateLimits: db.collection<RateLimitDoc>('rate_limits') as Collection<RateLimitDoc>,
    usedCaptchas: db.collection<UsedCaptchaDoc>('used_captchas') as Collection<UsedCaptchaDoc>,
    auditLogs: db.collection<AuditLogDoc>('audit_logs') as Collection<AuditLogDoc>,
    emailLogs: db.collection<EmailLogDoc>('email_logs') as Collection<EmailLogDoc>,
    telemetryEvents: db.collection<TelemetryEventDoc>('telemetry_events') as Collection<TelemetryEventDoc>,
  }
}
