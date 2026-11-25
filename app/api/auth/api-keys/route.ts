import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { z } from 'zod'
import { getCollections } from '@/lib/db/mongodb'
import { jsonError, requireCsrf } from '@/lib/security/api-guard'
import { generateRandomToken, sha256 } from '@/lib/security/crypto'
import { getCurrentSession } from '@/lib/security/session'
import { getRequestContext } from '@/lib/security/request-context'
import { logAuditEvent } from '@/lib/security/audit'
import { enforcePostResetProbation } from '@/lib/recovery/probation'
import { resolveResetMode } from '@/lib/recovery/config'

const CreateSchema = z.object({
  name: z.string().trim().min(2).max(60),
})

const DeleteSchema = z.object({
  id: z.string().min(8),
})

export async function GET() {
  const current = await getCurrentSession()
  if (!current) return jsonError('Authentication required.', 401)

  const { apiKeys } = await getCollections()
  const list = await apiKeys
    .find({ userId: current.user._id!, revokedAt: null })
    .sort({ createdAt: -1 })
    .toArray()

  return NextResponse.json({
    apiKeys: list.map((k) => ({
      id: k._id!.toString(),
      name: k.name,
      prefix: k.prefix,
      createdAt: k.createdAt.toISOString(),
    })),
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
    action: 'create_api_key',
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
    const parsed = CreateSchema.safeParse(body)
    if (!parsed.success) {
      return jsonError('Valid API key name is required.', 400)
    }

    const rawKey = `sr_live_${generateRandomToken(24)}`
    const prefix = rawKey.slice(0, 14)
    const now = new Date()
    const { apiKeys } = await getCollections()

    const res = await apiKeys.insertOne({
      userId: current.user._id!,
      name: parsed.data.name,
      prefix,
      keyHash: sha256(rawKey),
      createdAt: now,
      revokedAt: null,
    })

    await logAuditEvent({
      eventType: 'API_KEY_CREATED',
      severity: 'info',
      blocked: false,
      email: current.user.email,
      userId: current.user._id!,
      context,
      details: { name: parsed.data.name, prefix },
    })

    return NextResponse.json(
      {
        ok: true,
        apiKey: { id: res.insertedId.toString(), name: parsed.data.name, prefix, secret: rawKey },
      },
      { status: 201 }
    )
  } catch {
    return jsonError('Failed to create API key.', 500)
  }
}

export async function DELETE(req: NextRequest) {
  const csrfError = requireCsrf(req)
  if (csrfError) return csrfError

  const current = await getCurrentSession()
  if (!current) return jsonError('Authentication required.', 401)

  try {
    const body = await req.json()
    const parsed = DeleteSchema.safeParse(body)
    if (!parsed.success || !ObjectId.isValid(parsed.data.id)) {
      return jsonError('Valid key ID required.', 400)
    }

    const { apiKeys } = await getCollections()
    await apiKeys.updateOne(
      { _id: new ObjectId(parsed.data.id), userId: current.user._id! },
      { $set: { revokedAt: new Date() } }
    )
    return NextResponse.json({ ok: true })
  } catch {
    return jsonError('Failed to revoke API key.', 500)
  }
}
