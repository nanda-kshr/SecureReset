import { ObjectId } from 'mongodb'
import { AuditSeverity, getCollections, RiskLevel } from '@/lib/db/mongodb'
import { maskEmailForDisplay } from './crypto'
import type { RequestContext } from './request-context'

export interface LogAuditInput {
  eventType: string
  severity: AuditSeverity
  blocked: boolean
  email?: string
  userId?: ObjectId | null
  context: RequestContext
  riskLevel?: RiskLevel
  riskScore?: number
  details?: Record<string, unknown>
}

export async function logAuditEvent(input: LogAuditInput): Promise<void> {
  try {
    const { auditLogs } = await getCollections()
    await auditLogs.insertOne({
      eventType: input.eventType,
      severity: input.severity,
      blocked: input.blocked,
      // Store masked identifier to minimize PII retention in audit logs
      email: input.email ? maskEmailForDisplay(input.email.toLowerCase()) : undefined,
      userId: input.userId ?? null,
      ip: input.context.ip,
      location: input.context.location,
      deviceFingerprint: input.context.deviceFingerprint,
      userAgent: input.context.userAgent,
      riskLevel: input.riskLevel,
      riskScore: input.riskScore,
      details: input.details ?? {},
      createdAt: new Date(),
    })
  } catch (err) {
    console.error('Failed to write audit log:', err)
  }
}
