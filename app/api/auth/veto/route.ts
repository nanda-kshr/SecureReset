import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { z } from 'zod'
import { getCollections } from '@/lib/db/mongodb'
import { jsonError, requireCsrf } from '@/lib/security/api-guard'
import { sha256 } from '@/lib/security/crypto'
import { getRequestContext } from '@/lib/security/request-context'
import { getCurrentSession } from '@/lib/security/session'
import { logAuditEvent } from '@/lib/security/audit'
import { assertValidTransition, ResetState } from '@/lib/recovery/state-machine'
import { emitTelemetry } from '@/lib/recovery/telemetry'
import { resolveResetMode } from '@/lib/recovery/config'

const VetoPostSchema = z.object({
  vetoToken: z.string().min(32).optional(),
  resetId: z.string().optional(),
})

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  if (!token) {
    return jsonError('Missing veto token.', 400)
  }
  const { resetTokens } = await getCollections()
  const now = new Date()
  const doc = await resetTokens.findOne({ vetoTokenHash: sha256(token) })
  if (!doc || doc.vetoUsedAt || (doc.vetoExpiresAt && doc.vetoExpiresAt <= now)) {
    return NextResponse.json({ valid: false, message: 'Veto link is invalid, expired, or already used.' })
  }

  return NextResponse.json({
    valid: true,
    state: doc.state,
    completesAt: doc.completesAt?.toISOString() ?? null,
    originLocation: doc.location,
    originIp: doc.ip,
  })
}

export async function POST(req: NextRequest) {
  const csrfError = requireCsrf(req)
  if (csrfError) return csrfError

  const context = getRequestContext(req)
  const reqMode = resolveResetMode(req)

  try {
    const body = await req.json()
    const parsed = VetoPostSchema.safeParse(body)
    if (!parsed.success) {
      return jsonError('Invalid veto request.', 400)
    }

    const { resetTokens, users } = await getCollections()
    const now = new Date()
    let targetDoc = null

    if (parsed.data.vetoToken) {
      const vetoTokenHash = sha256(parsed.data.vetoToken)
      targetDoc = await resetTokens.findOne({
        vetoTokenHash,
        vetoUsedAt: null,
        vetoExpiresAt: { $gt: now },
      })
    } else if (parsed.data.resetId) {
      const current = await getCurrentSession()
      if (!current) {
        return jsonError('Authentication required to veto by reset ID.', 401)
      }
      targetDoc = await resetTokens.findOne({
        _id: new ObjectId(parsed.data.resetId),
        userId: current.user._id,
        usedAt: null,
      })
    }

    if (!targetDoc) {
      return jsonError('Veto request is invalid, expired, or already processed.', 400)
    }

    const currentState: ResetState = targetDoc.state || 'pending_cooling_off'
    assertValidTransition(currentState, 'vetoed')

    // Veto the target reset, cancel all other pending resets, and flag the account
    await Promise.all([
      resetTokens.updateOne(
        { _id: targetDoc._id },
        { $set: { state: 'vetoed', vetoUsedAt: now, usedAt: now } }
      ),
      resetTokens.updateMany(
        { userId: targetDoc.userId, usedAt: null, _id: { $ne: targetDoc._id } },
        { $set: { state: 'cancelled', usedAt: now } }
      ),
      users.updateOne(
        { _id: targetDoc.userId },
        {
          $set: {
            flaggedSuspicious: true,
            flaggedReason: `Owner vetoed password reset originating from ${targetDoc.location} (${targetDoc.ip})`,
            updatedAt: now,
          },
        }
      ),
    ])

    await logAuditEvent({
      eventType: 'RESET_VETOED_BY_OWNER',
      severity: 'critical',
      blocked: true,
      email: targetDoc.email,
      userId: targetDoc.userId,
      context,
      details: {
        vetoedResetOriginIp: targetDoc.ip,
        vetoedResetLocation: targetDoc.location,
      },
    })

    await emitTelemetry({
      mode: targetDoc.mode || reqMode,
      eventType: 'RESET_VETOED_BY_OWNER',
      state: 'vetoed',
      accountId: targetDoc.userId.toString(),
      computedDelayHours: targetDoc.coolingOffHours ?? 0,
      outcome: 'vetoed',
      actorType: 'legitimate',
    })

    return NextResponse.json({
      ok: true,
      state: 'vetoed',
      message:
        'Password reset cancelled and account flagged for review. Please review active sessions and recovery settings.',
    })
  } catch (err) {
    console.error('Veto error:', err)
    return jsonError('Unable to process veto.', 500)
  }
}
