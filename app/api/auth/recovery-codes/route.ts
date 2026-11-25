import { NextRequest, NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { getCollections } from '@/lib/db/mongodb'
import { jsonError, requireCsrf } from '@/lib/security/api-guard'
import { generateRecoveryCode, hashRecoveryCode } from '@/lib/security/crypto'
import { getCurrentSession } from '@/lib/security/session'
import { getRequestContext } from '@/lib/security/request-context'
import { logAuditEvent } from '@/lib/security/audit'
import { RECOVERY_CONFIG, resolveResetMode } from '@/lib/recovery/config'
import { enforcePostResetProbation } from '@/lib/recovery/probation'

export async function GET() {
  const current = await getCurrentSession()
  if (!current) return jsonError('Authentication required.', 401)

  const codes = current.user.recoveryCodes || []
  return NextResponse.json({
    total: codes.length,
    remaining: codes.filter((c) => !c.usedAt).length,
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
    action: 'change_recovery_settings',
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

  const now = new Date()
  const plaintextCodes: string[] = []
  const hashedRecords = Array.from({ length: RECOVERY_CONFIG.tokens.recoveryCodeCount }, () => {
    const code = generateRecoveryCode()
    plaintextCodes.push(code)
    return {
      id: crypto.randomUUID(),
      codeHash: hashRecoveryCode(code),
      createdAt: now,
      usedAt: null,
    }
  })

  const { users } = await getCollections()
  await users.updateOne(
    { _id: current.user._id },
    { $set: { recoveryCodes: hashedRecords, updatedAt: now } }
  )

  await logAuditEvent({
    eventType: 'RECOVERY_CODES_ROTATED',
    severity: 'info',
    blocked: false,
    email: current.user.email,
    userId: current.user._id!,
    context,
    details: { count: plaintextCodes.length },
  })

  // Plaintext codes are returned once upon generation and never stored unhashed
  return NextResponse.json({
    ok: true,
    codes: plaintextCodes,
  })
}
