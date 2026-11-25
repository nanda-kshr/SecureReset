'use client'

import { useCallback, useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'

interface DashboardData {
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

export default function SecurityDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [blockedOnly, setBlockedOnly] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const qs = blockedOnly ? '?blocked=true' : ''
      const res = await fetch(`/api/security/dashboard${qs}`)
      if (!res.ok) throw new Error('Failed to load telemetry')
      setData(await res.json())
    } catch {
      setError('Could not load security dashboard telemetry.')
    } finally {
      setLoading(false)
    }
  }, [blockedOnly])

  useEffect(() => {
    let cancelled = false
    const qs = blockedOnly ? '?blocked=true' : ''
    fetch(`/api/security/dashboard${qs}`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load telemetry')
        return res.json()
      })
      .then((json) => {
        if (!cancelled) {
          setData(json)
          setError(null)
        }
      })
      .catch(() => {
        if (!cancelled) setError('Could not load security dashboard telemetry.')
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
            Security Operations &amp; Audit Ledger
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
        <div className="rounded-md border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800">
          {error}
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

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-md border border-zinc-200 bg-white overflow-hidden">
              <div className="border-b border-zinc-200 bg-zinc-50 px-5 py-3">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-700">
                  Blocked Attack Breakdown
                </h2>
              </div>
              <div className="p-5">
                {data.attackBreakdown.length === 0 ? (
                  <p className="text-xs text-zinc-500">
                    No blocked attacks recorded yet. Run scenarios in the Attack Simulator.
                  </p>
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
            <div className="divide-y divide-zinc-200 max-h-[460px] overflow-y-auto">
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
                        {log.riskLevel && (
                          <span className="text-zinc-600">
                            Risk: <strong className="uppercase text-zinc-900">{log.riskLevel}</strong>
                            {typeof log.riskScore === 'number' ? ` (${log.riskScore})` : ''}
                          </span>
                        )}
                      </div>
                      <div className="text-zinc-500">
                        {log.email ? `${log.email} · ` : ''}
                        {log.location} (<span className="font-mono">{log.ip}</span>) · FP{' '}
                        <span className="font-mono">{log.deviceFingerprint.slice(0, 10)}…</span>
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

          <div className="rounded-md border border-zinc-200 bg-white overflow-hidden">
            <div className="border-b border-zinc-200 bg-zinc-50 px-5 py-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-700">
                Nodemailer SMTP Delivery Log
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-zinc-500 border-b border-zinc-200 bg-zinc-50/50">
                  <tr>
                    <th className="py-2.5 px-4 font-medium">Recipient</th>
                    <th className="py-2.5 px-4 font-medium">Template</th>
                    <th className="py-2.5 px-4 font-medium">Status</th>
                    <th className="py-2.5 px-4 font-medium">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200">
                  {data.emailLogs.map((mail) => (
                    <tr key={mail.id}>
                      <td className="py-2.5 px-4 text-zinc-900">{mail.to}</td>
                      <td className="py-2.5 px-4 font-mono text-zinc-600">{mail.template}</td>
                      <td className="py-2.5 px-4">
                        <span
                          className={`rounded border px-2 py-0.5 text-[11px] font-medium ${
                            mail.status === 'sent'
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              : 'bg-rose-50 text-rose-800 border-rose-200'
                          }`}
                        >
                          {mail.status.toUpperCase()}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 font-mono text-zinc-500">
                        {new Date(mail.createdAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
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
