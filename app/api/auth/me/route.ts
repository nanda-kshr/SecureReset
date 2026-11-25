import { NextRequest, NextResponse } from 'next/server'
import { getCollections } from '@/lib/db/mongodb'
import { sha256 } from '@/lib/security/crypto'
import { getCurrentSession, SESSION_COOKIE_NAME, toPublicUser } from '@/lib/security/session'
import { getRequestContext } from '@/lib/security/request-context'

export async function GET(req: NextRequest) {
  const current = await getCurrentSession()
  const context = getRequestContext(req)

  if (!current) {
    return NextResponse.json({ user: null, context, pendingResetBanner: null })
  }

  const rawCookie = req.cookies.get(SESSION_COOKIE_NAME)?.value
  const currentHash = rawCookie ? sha256(rawCookie) : ''
  const { sessions, resetTokens } = await getCollections()
  const now = new Date()

  const [active, pendingReset] = await Promise.all([
    sessions
      .find({
        userId: current.user._id,
        revokedAt: null,
        expiresAt: { $gt: now },
      })
      .sort({ createdAt: -1 })
      .toArray(),
    resetTokens.findOne(
      {
        userId: current.user._id,
        usedAt: null,
        state: 'pending_cooling_off',
      },
      { sort: { createdAt: -1 } }
    ),
  ])

  return NextResponse.json({
    user: toPublicUser(current.user),
    context,
    pendingResetBanner: pendingReset
      ? {
          resetId: pendingReset._id!.toString(),
          completesAt: pendingReset.completesAt?.toISOString() ?? null,
          coolingOffHours: pendingReset.coolingOffHours ?? 0,
          originIp: pendingReset.ip,
          originLocation: pendingReset.location,
        }
      : null,
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
