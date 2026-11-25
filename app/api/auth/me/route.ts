import { NextRequest, NextResponse } from 'next/server'
import { getCollections } from '@/lib/db/mongodb'
import { sha256 } from '@/lib/security/crypto'
import { getCurrentSession, SESSION_COOKIE_NAME, toPublicUser } from '@/lib/security/session'
import { getRequestContext } from '@/lib/security/request-context'

export async function GET(req: NextRequest) {
  const current = await getCurrentSession()
  const context = getRequestContext(req)

  if (!current) {
    return NextResponse.json({ user: null, context })
  }

  const rawCookie = req.cookies.get(SESSION_COOKIE_NAME)?.value
  const currentHash = rawCookie ? sha256(rawCookie) : ''
  const { sessions } = await getCollections()
  const active = await sessions
    .find({
      userId: current.user._id,
      revokedAt: null,
      expiresAt: { $gt: new Date() },
    })
    .sort({ createdAt: -1 })
    .toArray()

  return NextResponse.json({
    user: toPublicUser(current.user),
    context,
    activeSessions: active.map((s) => ({
      id: s._id!.toString(),
      deviceLabel: s.deviceLabel,
      ip: s.ip,
      location: s.location,
      createdAt: s.createdAt.toISOString(),
      expiresAt: s.expiresAt.toISOString(),
      isCurrent: s.tokenHash === currentHash,
    })),
  })
}
