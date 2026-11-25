import { NextRequest, NextResponse } from 'next/server'
import { getCollections } from '@/lib/db/mongodb'
import { getCurrentSession } from '@/lib/security/session'
import { RECOVERY_CONFIG, resolveResetMode } from '@/lib/recovery/config'
import { sampleDelayCurve } from '@/lib/recovery/assurance'

export async function GET(req: NextRequest) {
  try {
    const current = await getCurrentSession(req)
    if (!current) {
      return NextResponse.json({ error: 'Authentication required to view Security SOC.' }, { status: 401 })
    }
    if (current.user.role !== 'admin') {
      return NextResponse.json({ error: 'Admin role required to view Security SOC.' }, { status: 403 })
    }

    const { auditLogs, resetTokens, rateLimits, emailLogs, telemetryEvents } = await getCollections()
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
      recentTelemetry,
      allTelemetry,
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
      telemetryEvents.find({}).sort({ timestamp: -1 }).limit(40).toArray(),
      telemetryEvents.find({}).toArray(),
    ])

    // Compute experimental evaluation metrics per mode from structured telemetry
    const modes = ['naive', 'standard', 'framework'] as const
    const evaluationByMode = modes.map((mode) => {
      const evs = allTelemetry.filter((e) => e.mode === mode)
      const attackerTotal = evs.filter(
        (e) => e.actorType === 'attacker' && e.eventType === 'RESET_REQUESTED'
      ).length
      const attackerSuccess = evs.filter(
        (e) => e.actorType === 'attacker' && e.outcome === 'completed'
      ).length
      const attackerVetoed = evs.filter(
        (e) => e.eventType === 'RESET_VETOED_BY_OWNER'
      ).length
      const attackerPending = evs.filter(
        (e) => e.actorType === 'attacker' && e.eventType === 'COOLING_OFF_ENTERED'
      ).length
      const legitTotal = evs.filter(
        (e) => e.actorType === 'legitimate' && e.eventType === 'RESET_REQUESTED'
      ).length
      const legitBlocked = evs.filter(
        (e) => e.actorType === 'legitimate' && e.outcome === 'blocked'
      ).length
      const delays = evs
        .filter((e) => e.actorType === 'legitimate' && typeof e.computedDelayHours === 'number')
        .map((e) => e.computedDelayHours as number)

      const avgDelay =
        delays.length > 0
          ? Number((delays.reduce((a, b) => a + b, 0) / delays.length).toFixed(2))
          : 0

      return {
        mode,
        events: evs.length,
        attackerSuccessRate:
          attackerTotal > 0 ? Number(((attackerSuccess / attackerTotal) * 100).toFixed(1)) : 0,
        vetoWindowCoverage:
          attackerPending > 0 ? Number(((attackerVetoed / attackerPending) * 100).toFixed(1)) : 0,
        falseBlockRate:
          legitTotal > 0 ? Number(((legitBlocked / legitTotal) * 100).toFixed(1)) : 0,
        avgTimeToRecoverHours: avgDelay,
      }
    })

    return NextResponse.json({
      activeMode: resolveResetMode(req),
      curveConfig: {
        activeShape: RECOVERY_CONFIG.assurance.curveShape,
        maxDelayHours: RECOVERY_CONFIG.assurance.maxDelayHours,
        piecewisePoints: sampleDelayCurve('piecewise-linear'),
        logisticPoints: sampleDelayCurve('logistic'),
      },
      evaluationByMode,
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
      telemetryEvents: recentTelemetry.map((ev) => ({
        id: ev._id!.toString(),
        timestamp: ev.timestamp.toISOString(),
        mode: ev.mode,
        eventType: ev.eventType,
        state: ev.state,
        accountHash: ev.accountHash,
        assuranceAchieved: ev.assuranceAchieved,
        assuranceRequired: ev.assuranceRequired,
        scoreGap: ev.scoreGap,
        computedDelayHours: ev.computedDelayHours,
        outcome: ev.outcome,
        actorType: ev.actorType,
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
