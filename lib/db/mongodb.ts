import { MongoClient, Db, Collection, ObjectId } from 'mongodb'

export interface KnownDevice {
  fingerprint: string
  label: string
  ip: string
  location: string
  lastSeenAt: Date
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
  securityQuestion?: {
    question: string
    answerHash: string
  } | null
  knownDevices: KnownDevice[]
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

export type RiskLevel = 'low' | 'medium' | 'high'
export type ExtraCheckType = 'none' | 'security_question' | 'totp' | 'both'

export interface ResetTokenDoc {
  _id?: ObjectId
  userId: ObjectId
  email: string
  tokenHash: string
  otpHash: string
  deviceFingerprint: string
  ip: string
  location: string
  riskScore: number
  riskLevel: RiskLevel
  riskFactors: string[]
  extraCheckRequired: ExtraCheckType
  extraCheckPassed: boolean
  otpVerified: boolean
  otpAttempts: number
  lockedUntil: Date | null
  usedAt: Date | null
  expiresAt: Date
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
  template: 'reset_instructions' | 'password_changed'
  status: 'sent' | 'failed'
  messageId?: string
  error?: string
  createdAt: Date
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
  await ensureIndexes(db)
  return db
}

async function ensureIndexes(db: Db): Promise<void> {
  if (!globalThis.__mongoIndexesEnsured) {
    globalThis.__mongoIndexesEnsured = (async () => {
      await Promise.all([
        db.collection('users').createIndex({ email: 1 }, { unique: true }),
        db.collection('sessions').createIndex({ tokenHash: 1 }, { unique: true }),
        db.collection('sessions').createIndex({ userId: 1, revokedAt: 1 }),
        db.collection('reset_tokens').createIndex({ tokenHash: 1 }, { unique: true }),
        db.collection('reset_tokens').createIndex({ email: 1, createdAt: -1 }),
        db.collection('rate_limits').createIndex({ key: 1 }, { unique: true }),
        db.collection('used_captchas').createIndex({ nonce: 1 }, { unique: true }),
        db.collection('used_captchas').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
        db.collection('audit_logs').createIndex({ createdAt: -1 }),
        db.collection('audit_logs').createIndex({ blocked: 1, eventType: 1 }),
        db.collection('email_logs').createIndex({ createdAt: -1 }),
      ])
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
    resetTokens: db.collection<ResetTokenDoc>('reset_tokens') as Collection<ResetTokenDoc>,
    rateLimits: db.collection<RateLimitDoc>('rate_limits') as Collection<RateLimitDoc>,
    usedCaptchas: db.collection<UsedCaptchaDoc>('used_captchas') as Collection<UsedCaptchaDoc>,
    auditLogs: db.collection<AuditLogDoc>('audit_logs') as Collection<AuditLogDoc>,
    emailLogs: db.collection<EmailLogDoc>('email_logs') as Collection<EmailLogDoc>,
  }
}
