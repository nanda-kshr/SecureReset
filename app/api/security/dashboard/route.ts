import { NextRequest, NextResponse } from 'next/server'
import { getCollections } from '@/lib/db/mongodb'

export async function GET(req: NextRequest) {
  try {
    const { auditLogs, resetTokens, rateLimits, emailLogs } = await getCollections()
    const now = new Date()

    const url = new URL(req.url)
    const severityFilter = url.searchParams.get('severity')
    const blockedOnly = url.searchParams.get('blocked') === 'true'

    const query: Record<string, unknown> = {}
    if (severityFilter && ['info', 'warning', 'blocked', 'critical'].includes(severityFilter)) {
      query.severity = severityFilter
    }
    if (blockedOnly) {
      query.blocked = true
    }

    const [
      totalResetRequests,
      successfulResets,
      blockedAttacks,
      enumerationProbes,
      activeTokenLockouts,
      activeRateLockouts,
      attackBreakdownRaw,
      suspiciousIpsRaw,
      recentLogs,
      recentEmails,
    ] = await Promise.all([
      auditLogs.countDocuments({ eventType: 'RESET_REQUESTED' }),
      auditLogs.countDocuments({ eventType: 'PASSWORD_RESET_SUCCESS' }),
      auditLogs.countDocuments({ blocked: true }),
      auditLogs.countDocuments({ eventType: 'RESET_ENUMERATION_PROBE' }),
      resetTokens.countDocuments({ lockedUntil: { $gt: now } }),
      rateLimits.countDocuments({ lockedUntil: { $gt: now } }),
      auditLogs
        .aggregate([
          { $match: { blocked: true } },
          { $group: { _id: '$eventType', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
        ])
        .toArray(),
      auditLogs
        .aggregate([
          {
            $group: {
              _id: { ip: '$ip', location: '$location' },
              totalEvents: { $sum: 1 },
              blockedCount: {
                $sum: { $cond: [{ $eq: ['$blocked', true] }, 1, 0] },
              },
              lastSeen: { $max: '$createdAt' },
            },
          },
          { $sort: { blockedCount: -1, lastSeen: -1 } },
          { $limit: 12 },
        ])
        .toArray(),
      auditLogs.find(query).sort({ createdAt: -1 }).limit(60).toArray(),
      emailLogs.find({}).sort({ createdAt: -1 }).limit(20).toArray(),
    ])

    return NextResponse.json({
      kpis: {
        totalResetRequests,
        successfulResets,
        blockedAttacks,
        enumerationProbes,
        activeLockouts: activeTokenLockouts + activeRateLockouts,
      },
      attackBreakdown: attackBreakdownRaw.map((item) => ({
        eventType: String(item._id),
        count: Number(item.count),
      })),
      suspiciousIps: suspiciousIpsRaw.map((item) => ({
        ip: String(item._id?.ip || 'unknown'),
        location: String(item._id?.location || 'Unknown'),
        totalEvents: Number(item.totalEvents),
        blockedCount: Number(item.blockedCount),
        lastSeen: item.lastSeen instanceof Date ? item.lastSeen.toISOString() : String(item.lastSeen),
      })),
      auditLogs: recentLogs.map((log) => ({
        id: log._id!.toString(),
        eventType: log.eventType,
        severity: log.severity,
        blocked: log.blocked,
        email: log.email || null,
        ip: log.ip,
        location: log.location,
        deviceFingerprint: log.deviceFingerprint,
        riskLevel: log.riskLevel || null,
        riskScore: typeof log.riskScore === 'number' ? log.riskScore : null,
        details: log.details,
        createdAt: log.createdAt.toISOString(),
      })),
      emailLogs: recentEmails.map((mail) => ({
        id: mail._id!.toString(),
        to: mail.to,
        subject: mail.subject,
        template: mail.template,
        status: mail.status,
        messageId: mail.messageId || null,
        error: mail.error || null,
        createdAt: mail.createdAt.toISOString(),
      })),
    })
  } catch (err) {
    console.error('Security dashboard error:', err)
    return NextResponse.json({ error: 'Failed to load security telemetry' }, { status: 500 })
  }
}
