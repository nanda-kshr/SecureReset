import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import crypto from 'node:crypto'
import { getCollections } from '@/lib/db/mongodb'
import { jsonError, requireCsrf } from '@/lib/security/api-guard'
import { getCurrentSession, toPublicUser } from '@/lib/security/session'
import { getRequestContext } from '@/lib/security/request-context'
import { logAuditEvent } from '@/lib/security/audit'
import { enforcePostResetProbation } from '@/lib/recovery/probation'
import { resolveResetMode } from '@/lib/recovery/config'

const EnrollSchema = z.object({
  label: z.string().trim().min(2).max(80),
  publicKeyJwk: z.object({
    kty: z.literal('EC'),
    crv: z.literal('P-256'),
    x: z.string().min(10),
    y: z.string().min(10),
  }),
})

const RevokeSchema = z.object({
  keyId: z.string().min(4),
})

export async function GET() {
  const current = await getCurrentSession()
  if (!current) return jsonError('Authentication required.', 401)
  return NextResponse.json({
    trustedBrowserKeys: toPublicUser(current.user).trustedBrowserKeys,
  })
}

export async function POST(req: NextRequest) {
  const csrfError = requireCsrf(req)
  if (csrfError) return csrfError

  const current = await getCurrentSession()
  if (!current) return jsonError('Authentication required.', 401)

  const context = getRequestContext(req)
  const mode = resolveResetMode(req)

  const probation = await enforcePostResetProbation({
    user: current.user,
    action: 'add_trusted_key_or_passkey',
    context,
    mode,
    sessionCreatedAt: current.session.createdAt,
  })
  if (!probation.allowed) {
    return jsonError(probation.message!, 403, {
      code: 'PROBATION_ACTIVE',
      unlocksAt: probation.unlocksAt,
    })
  }

  try {
    const body = await req.json()
    const parsed = EnrollSchema.safeParse(body)
    if (!parsed.success) {
      return jsonError('Invalid ECDSA P-256 public key payload.', 400)
    }

    const keyId = crypto.randomUUID()
    const now = new Date()
    const { users } = await getCollections()

    await users.updateOne(
      { _id: current.user._id },
      {
        $push: {
          trustedBrowserKeys: {
            keyId,
            label: parsed.data.label,
            publicKeyJwk: parsed.data.publicKeyJwk,
            createdAt: now,
            lastUsedAt: null,
            revokedAt: null,
          },
        },
        $set: { updatedAt: now },
      }
    )

    await logAuditEvent({
      eventType: 'BROWSER_KEY_ENROLLED',
      severity: 'info',
      blocked: false,
      email: current.user.email,
      userId: current.user._id!,
      context,
      details: { keyId, label: parsed.data.label },
    })

    const updated = await users.findOne({ _id: current.user._id })
    return NextResponse.json(
      { ok: true, keyId, user: updated ? toPublicUser(updated) : null },
      { status: 201 }
    )
  } catch (err) {
    console.error('Trusted browser enroll error:', err)
    return jsonError('Failed to enroll trusted browser key.', 500)
  }
}

export async function DELETE(req: NextRequest) {
  const csrfError = requireCsrf(req)
  if (csrfError) return csrfError

  const current = await getCurrentSession()
  if (!current) return jsonError('Authentication required.', 401)

  const context = getRequestContext(req)

  try {
    const body = await req.json()
    const parsed = RevokeSchema.safeParse(body)
    if (!parsed.success) {
      return jsonError('keyId is required.', 400)
    }

    const { users } = await getCollections()
    const now = new Date()
    const res = await users.updateOne(
      { _id: current.user._id, 'trustedBrowserKeys.keyId': parsed.data.keyId },
      { $set: { 'trustedBrowserKeys.$.revokedAt': now, updatedAt: now } }
    )

    if (res.modifiedCount === 0) {
      return jsonError('Trusted browser key not found.', 404)
    }

    await logAuditEvent({
      eventType: 'BROWSER_KEY_REVOKED',
      severity: 'warning',
      blocked: false,
      email: current.user.email,
      userId: current.user._id!,
      context,
      details: { keyId: parsed.data.keyId },
    })

    const updated = await users.findOne({ _id: current.user._id })
    return NextResponse.json({ ok: true, user: updated ? toPublicUser(updated) : null })
  } catch {
    return jsonError('Failed to revoke trusted browser key.', 500)
  }
}
