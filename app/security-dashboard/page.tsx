'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'

interface CurvePoint {
  gap: number
  hours: number
}

interface ModeMetric {
  mode: string
  events: number
  attackerSuccessRate: number
  vetoWindowCoverage: number
  falseBlockRate: number
  avgTimeToRecoverHours: number
}

interface TelemetryItem {
  id: string
  timestamp: string
  mode: string
  eventType: string
  state: string
  accountHash: string
  assuranceAchieved: number | null
  assuranceRequired: number | null
  scoreGap: number | null
  computedDelayHours: number | null
  outcome: string
  actorType: string
}

interface DashboardData {
  activeMode?: string
  curveConfig?: {
    activeShape: string
    maxDelayHours: number
    piecewisePoints: CurvePoint[]
    logisticPoints: CurvePoint[]
  }
  evaluationByMode?: ModeMetric[]
  telemetryEvents?: TelemetryItem[]
  kpis: {
    totalResetRequests: number
    successfulResets: number
    blockedAttacks: number
    enumerationProbes: number
    activeLockouts: number
  }
  attackBreakdown: Array<{ eventType: string; count: number }>
  suspiciousIps: Array<{
    ip: string
    location: string
    totalEvents: number
    blockedCount: number
    lastSeen: string
  }>
  auditLogs: Array<{
    id: string
    eventType: string
    severity: 'info' | 'warning' | 'blocked' | 'critical'
    blocked: boolean
    email: string | null
    ip: string
    location: string
    deviceFingerprint: string
    riskLevel: string | null
    riskScore: number | null
    details: Record<string, unknown>
    createdAt: string
  }>
  emailLogs: Array<{
    id: string
    to: string
    subject: string
    template: string
    status: 'sent' | 'failed'
    messageId: string | null
    error: string | null
    createdAt: string
  }>
}

const SEVERITY_BADGE: Record<string, string> = {
  info: 'bg-zinc-100 text-zinc-700 border-zinc-200',
  warning: 'bg-amber-50 text-amber-800 border-amber-200',
  blocked: 'bg-rose-50 text-rose-800 border-rose-200',
  critical: 'bg-rose-100 text-rose-900 border-rose-300',
}

function toPolylinePoints(points: CurvePoint[]): string {
  return points
    .map((p) => {
      const x = 40 + (p.gap / 100) * 320
      const y = 160 - (p.hours / 72) * 130
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
}

export default function SecurityDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [blockedOnly, setBlockedOnly] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [authStatus, setAuthStatus] = useState<number | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const qs = blockedOnly ? '?blocked=true' : ''
      const res = await fetch(`/api/security/dashboard${qs}`, { credentials: 'include' })
      if (!res.ok) {
        setAuthStatus(res.status)
        throw new Error('Failed to load telemetry')
      }
      setAuthStatus(200)
      setData(await res.json())
    } catch {
      setError('Admin authentication required to view Security Audit telemetry.')
    } finally {
      setLoading(false)
    }
  }, [blockedOnly])

  useEffect(() => {
    let cancelled = false
    const qs = blockedOnly ? '?blocked=true' : ''
    fetch(`/api/security/dashboard${qs}`, { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) {
          if (!cancelled) setAuthStatus(res.status)
          throw new Error('Failed to load telemetry')
        }
        if (!cancelled) setAuthStatus(200)
        return res.json()
      })
      .then((json) => {
        if (!cancelled) {
          setData(json)
          setError(null)
        }
      })
      .catch(() => {
        if (!cancelled) setError('Admin authentication required to view Security Audit telemetry.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [blockedOnly])

  const maxAttackCount = Math.max(1, ...(data?.attackBreakdown.map((a) => a.count) || [1]))

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-zinc-200 pb-6">
        <div className="space-y-1">
          <div className="text-[11px] font-mono uppercase tracking-wider text-zinc-500">
            Security Operations &amp; Evaluation Telemetry
          </div>
          <h1 className="font-serif text-3xl font-medium text-zinc-950">
            Threat Telemetry &amp; Audit Timeline
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setBlockedOnly((v) => !v)}
            className={`rounded-md border px-3 py-1.5 text-xs font-medium cursor-pointer transition-colors ${
              blockedOnly
                ? 'border-zinc-950 bg-zinc-950 text-white'
                : 'border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50'
            }`}
          >
            {blockedOnly ? 'Showing Blocked Only' : 'Filter: Blocked Only'}
          </button>
          <button
            type="button"
            onClick={loadData}
            className="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-zinc-200 bg-white p-6 space-y-3 text-xs text-zinc-700">
          <div className="font-semibold text-zinc-950">
            {authStatus === 403 ? 'Admin Role Required (403)' : 'Sign In Required (401)'}
          </div>
          <p>{error}</p>
          <Link href="/login" className="inline-block rounded-md bg-zinc-950 px-4 py-2 font-medium text-white">
            Sign in as Admin →
          </Link>
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 border border-zinc-200 rounded-md bg-white divide-y lg:divide-y-0 lg:divide-x divide-zinc-200">
            <KpiCell label="Reset Requests" value={data.kpis.totalResetRequests} />
            <KpiCell label="Successful Resets" value={data.kpis.successfulResets} />
            <KpiCell label="Blocked Attacks" value={data.kpis.blockedAttacks} accent="rose" />
            <KpiCell label="Enumeration Probes" value={data.kpis.enumerationProbes} />
            <KpiCell label="Active Lockouts" value={data.kpis.activeLockouts} />
          </div>

          {data.curveConfig && data.evaluationByMode && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="rounded-md border border-zinc-200 bg-white overflow-hidden">
                <div className="border-b border-zinc-200 bg-zinc-50 px-5 py-3 flex items-center justify-between">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-700">
                    Assurance-Gap to Cooling-Off Delay Curve
                  </h2>
                  <span className="font-mono text-[11px] text-zinc-500">
                    Active: {data.curveConfig.activeShape}
                  </span>
                </div>
                <div className="p-5 space-y-3">
                  <svg viewBox="0 0 380 190" className="w-full h-44" role="img" aria-label="Score gap to cooling-off delay curve">
                    <line x1="40" y1="160" x2="360" y2="160" stroke="#e4e4e7" strokeWidth="1" />
                    <line x1="40" y1="30" x2="40" y2="160" stroke="#e4e4e7" strokeWidth="1" />
                    <text x="8" y="34" fontSize="9" fill="#71717a">72h</text>
                    <text x="8" y="98" fontSize="9" fill="#71717a">36h</text>
                    <text x="14" y="162" fontSize="9" fill="#71717a">0h</text>
                    <text x="40" y="176" fontSize="9" fill="#71717a">Gap 0</text>
                    <text x="190" y="176" fontSize="9" fill="#71717a">Gap 50</text>
                    <text x="330" y="176" fontSize="9" fill="#71717a">Gap 100</text>
                    <polyline
                      fill="none"
                      stroke="#18181b"
                      strokeWidth="2"
                      points={toPolylinePoints(data.curveConfig.piecewisePoints)}
                    />
                    <polyline
                      fill="none"
                      stroke="#2563eb"
                      strokeWidth="1.75"
                      strokeDasharray="4 3"
                      points={toPolylinePoints(data.curveConfig.logisticPoints)}
                    />
                  </svg>
                  <div className="flex items-center gap-4 text-[11px] text-zinc-600">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-0.5 w-4 bg-zinc-900 inline-block" /> Piecewise-Linear
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-0.5 w-4 border-t-2 border-dashed border-blue-600 inline-block" /> Logistic
                    </span>
                  </div>
                </div>
              </div>

              <div className="rounded-md border border-zinc-200 bg-white overflow-hidden">
                <div className="border-b border-zinc-200 bg-zinc-50 px-5 py-3">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-700">
                    Mode Evaluation Metrics (Live Telemetry)
                  </h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="text-zinc-500 border-b border-zinc-200 bg-zinc-50/50">
                      <tr>
                        <th className="py-2.5 px-4 font-medium">Mode</th>
                        <th className="py-2.5 px-3 font-medium text-right">Attacker Succ.</th>
                        <th className="py-2.5 px-3 font-medium text-right">Veto Cov.</th>
                        <th className="py-2.5 px-3 font-medium text-right">False Block</th>
                        <th className="py-2.5 px-4 font-medium text-right">Avg Recover</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200 font-mono">
                      {data.evaluationByMode.map((row) => (
                        <tr key={row.mode}>
                          <td className="py-2.5 px-4 font-semibold text-zinc-900 uppercase">{row.mode}</td>
                          <td className="py-2.5 px-3 text-right">{row.attackerSuccessRate}%</td>
                          <td className="py-2.5 px-3 text-right">{row.vetoWindowCoverage}%</td>
                          <td className="py-2.5 px-3 text-right">{row.falseBlockRate}%</td>
                          <td className="py-2.5 px-4 text-right">{row.avgTimeToRecoverHours}h</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-md border border-zinc-200 bg-white overflow-hidden">
              <div className="border-b border-zinc-200 bg-zinc-50 px-5 py-3">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-700">
                  Blocked Attack Breakdown
                </h2>
              </div>
              <div className="p-5">
                {data.attackBreakdown.length === 0 ? (
                  <p className="text-xs text-zinc-500">No blocked attacks recorded yet.</p>
                ) : (
                  <div className="space-y-3.5">
                    {data.attackBreakdown.map((item) => (
                      <div key={item.eventType} className="space-y-1.5">
                        <div className="flex justify-between text-xs">
                          <span className="font-mono text-zinc-800">{item.eventType}</span>
                          <span className="font-mono font-semibold text-zinc-950 tabular-nums">
                            {item.count}
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-zinc-100 overflow-hidden">
                          <div
                            className="h-full bg-zinc-900"
                            style={{ width: `${(item.count / maxAttackCount) * 100}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-md border border-zinc-200 bg-white overflow-hidden">
              <div className="border-b border-zinc-200 bg-zinc-50 px-5 py-3">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-700">
                  Origins &amp; Suspicious IPs
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="text-zinc-500 border-b border-zinc-200 bg-zinc-50/50">
                    <tr>
                      <th className="py-2.5 px-4 font-medium">IP Address</th>
                      <th className="py-2.5 px-4 font-medium">Location</th>
                      <th className="py-2.5 px-4 font-medium text-right">Blocked</th>
                      <th className="py-2.5 px-4 font-medium text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200">
                    {data.suspiciousIps.map((row) => (
                      <tr key={`${row.ip}-${row.location}`}>
                        <td className="py-2.5 px-4 font-mono text-zinc-900">{row.ip}</td>
                        <td className="py-2.5 px-4 text-zinc-700">{row.location}</td>
                        <td className="py-2.5 px-4 font-mono font-semibold text-rose-700 text-right tabular-nums">
                          {row.blockedCount}
                        </td>
                        <td className="py-2.5 px-4 font-mono text-zinc-500 text-right tabular-nums">
                          {row.totalEvents}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="rounded-md border border-zinc-200 bg-white overflow-hidden">
            <div className="border-b border-zinc-200 bg-zinc-50 px-5 py-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-700">
                Chronological Audit Log
              </h2>
            </div>
            <div className="divide-y divide-zinc-200 max-h-[420px] overflow-y-auto">
              {data.auditLogs.length === 0 ? (
                <p className="p-5 text-xs text-zinc-500">No audit events recorded yet.</p>
              ) : (
                data.auditLogs.map((log) => (
                  <div
                    key={log.id}
                    className="px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded border px-2 py-0.5 font-mono text-[11px] font-medium ${
                            SEVERITY_BADGE[log.severity] || SEVERITY_BADGE.info
                          }`}
                        >
                          {log.eventType}
                        </span>
                        {log.blocked && (
                          <span className="rounded border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-800">
                            BLOCKED
                          </span>
                        )}
                      </div>
                      <div className="text-zinc-500">
                        {log.email ? `${log.email} · ` : ''}
                        {log.location} (<span className="font-mono">{log.ip}</span>)
                      </div>
                    </div>
                    <span className="font-mono text-zinc-400 shrink-0">
                      {new Date(log.createdAt).toLocaleString()}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {data.telemetryEvents && data.telemetryEvents.length > 0 && (
            <div className="rounded-md border border-zinc-200 bg-white overflow-hidden">
              <div className="border-b border-zinc-200 bg-zinc-50 px-5 py-3">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-700">
                  Structured PII-Free Telemetry Stream
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="text-zinc-500 border-b border-zinc-200 bg-zinc-50/50">
                    <tr>
                      <th className="py-2 px-4 font-medium">Mode</th>
                      <th className="py-2 px-4 font-medium">Event</th>
                      <th className="py-2 px-4 font-medium">State</th>
                      <th className="py-2 px-4 font-medium">Score / Req</th>
                      <th className="py-2 px-4 font-medium">Delay</th>
                      <th className="py-2 px-4 font-medium">Outcome</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200">
                    {data.telemetryEvents.map((ev) => (
                      <tr key={ev.id}>
                        <td className="py-2 px-4 uppercase">{ev.mode}</td>
                        <td className="py-2 px-4">{ev.eventType}</td>
                        <td className="py-2 px-4">{ev.state}</td>
                        <td className="py-2 px-4">
                          {ev.assuranceAchieved !== null ? `${ev.assuranceAchieved}/${ev.assuranceRequired}` : '—'}
                        </td>
                        <td className="py-2 px-4">
                          {ev.computedDelayHours !== null ? `${ev.computedDelayHours}h` : '—'}
                        </td>
                        <td className="py-2 px-4">{ev.outcome}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function KpiCell({
  label,
  value,
  accent,
}: {
  label: string
  value: number
  accent?: 'rose'
}) {
  return (
    <div className="p-5 space-y-1.5">
      <div className="text-xs text-zinc-500">{label}</div>
      <div
        className={`text-2xl font-semibold tabular-nums ${
          accent === 'rose' ? 'text-rose-700' : 'text-zinc-950'
        }`}
      >
        {value}
      </div>
    </div>
  )
}
