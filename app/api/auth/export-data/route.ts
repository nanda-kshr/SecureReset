import { NextRequest, NextResponse } from 'next/server'
import { jsonError, requireCsrf } from '@/lib/security/api-guard'
import { getCurrentSession, toPublicUser } from '@/lib/security/session'
import { getRequestContext } from '@/lib/security/request-context'
import { logAuditEvent } from '@/lib/security/audit'
import { enforcePostResetProbation } from '@/lib/recovery/probation'
import { resolveResetMode } from '@/lib/recovery/config'

export async function POST(req: NextRequest) {
  const csrfError = requireCsrf(req)
  if (csrfError) return csrfError

  const current = await getCurrentSession()
  if (!current) return jsonError('Authentication required.', 401)

  const context = getRequestContext(req)
  const mode = resolveResetMode(req)

  const probation = await enforcePostResetProbation({
    user: current.user,
    action: 'export_data',
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

  await logAuditEvent({
    eventType: 'ACCOUNT_DATA_EXPORTED',
    severity: 'info',
    blocked: false,
    email: current.user.email,
    userId: current.user._id!,
    context,
  })

  return NextResponse.json({
    exportedAt: new Date().toISOString(),
    account: toPublicUser(current.user),
  })
}
