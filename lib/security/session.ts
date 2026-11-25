import { cookies } from 'next/headers'
import { ObjectId } from 'mongodb'
import { getCollections, UserDoc } from '@/lib/db/mongodb'
import { generateRandomToken, sha256 } from './crypto'
import type { RequestContext } from './request-context'

export const SESSION_COOKIE_NAME = 'sr_session'
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000

export interface PublicUser {
  id: string
  name: string
  email: string
  role: 'user' | 'admin'
  totpEnabled: boolean
  hasSecurityQuestion: boolean
  securityQuestionText: string | null
  knownDevices: Array<{
    fingerprint: string
    label: string
    ip: string
    location: string
    lastSeenAt: string
  }>
}

export function toPublicUser(user: UserDoc): PublicUser {
  return {
    id: user._id!.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
    totpEnabled: Boolean(user.totpEnabled),
    hasSecurityQuestion: Boolean(user.securityQuestion?.answerHash),
    securityQuestionText: user.securityQuestion?.question ?? null,
    knownDevices: (user.knownDevices || []).map((d) => ({
      fingerprint: d.fingerprint,
      label: d.label,
      ip: d.ip,
      location: d.location,
      lastSeenAt: d.lastSeenAt instanceof Date ? d.lastSeenAt.toISOString() : String(d.lastSeenAt),
    })),
  }
}

export async function createSession(
  userId: ObjectId,
  context: RequestContext
): Promise<{ rawToken: string; expiresAt: Date }> {
  const { sessions } = await getCollections()
  const rawToken = generateRandomToken(32)
  const tokenHash = sha256(rawToken)
  const now = new Date()
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS)

  await sessions.insertOne({
    userId,
    tokenHash,
    deviceFingerprint: context.deviceFingerprint,
    deviceLabel: context.deviceLabel,
    ip: context.ip,
    location: context.location,
    userAgent: context.userAgent,
    createdAt: now,
    expiresAt,
    revokedAt: null,
  })

  return { rawToken, expiresAt }
}

export async function getCurrentSession() {
  const cookieStore = await cookies()
  const rawToken = cookieStore.get(SESSION_COOKIE_NAME)?.value
  if (!rawToken) return null

  const tokenHash = sha256(rawToken)
  const { sessions, users } = await getCollections()
  const now = new Date()

  const session = await sessions.findOne({
    tokenHash,
    revokedAt: null,
    expiresAt: { $gt: now },
  })
  if (!session) return null

  const user = await users.findOne({ _id: session.userId })
  if (!user) return null

  return { session, user }
}

export async function revokeSessionByRawToken(rawToken: string): Promise<void> {
  const { sessions } = await getCollections()
  await sessions.updateOne(
    { tokenHash: sha256(rawToken), revokedAt: null },
    { $set: { revokedAt: new Date() } }
  )
}

export async function revokeAllUserSessions(userId: ObjectId): Promise<number> {
  const { sessions } = await getCollections()
  const result = await sessions.updateMany(
    { userId, revokedAt: null },
    { $set: { revokedAt: new Date() } }
  )
  return result.modifiedCount
}

export function sessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: expiresAt,
  }
}
