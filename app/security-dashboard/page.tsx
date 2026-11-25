'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Activity,
  Ban,
  CheckCircle2,
  Globe,
  Lock,
  Mail,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react'

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
  info: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  warning: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  blocked: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  critical: 'bg-red-600/25 text-red-200 border-red-500/50',
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
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 text-emerald-400 text-xs font-semibold uppercase tracking-wider">
            <Activity className="h-4 w-4" />
            Security Operations Center (SOC)
          </div>
          <h1 className="text-2xl font-bold text-white">Threat Telemetry &amp; Audit Timeline</h1>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setBlockedOnly((v) => !v)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium cursor-pointer ${
              blockedOnly
                ? 'border-rose-500/50 bg-rose-500/15 text-rose-200'
                : 'border-slate-700 bg-slate-900 text-slate-300'
            }`}
          >
            {blockedOnly ? 'Showing Blocked Only' : 'Show Blocked Only'}
          </button>
          <button
            type="button"
            onClick={loadData}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800 cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-200">
          {error}
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <KpiCard
              label="Reset Requests"
              value={data.kpis.totalResetRequests}
              icon={<Activity className="h-4 w-4 text-sky-400" />}
            />
            <KpiCard
              label="Successful Resets"
              value={data.kpis.successfulResets}
              icon={<CheckCircle2 className="h-4 w-4 text-emerald-400" />}
            />
            <KpiCard
              label="Blocked Attacks"
              value={data.kpis.blockedAttacks}
              icon={<Ban className="h-4 w-4 text-rose-400" />}
              highlight="rose"
            />
            <KpiCard
              label="Enumeration Probes"
              value={data.kpis.enumerationProbes}
              icon={<ShieldAlert className="h-4 w-4 text-amber-400" />}
            />
            <KpiCard
              label="Active Lockouts"
              value={data.kpis.activeLockouts}
              icon={<Lock className="h-4 w-4 text-orange-400" />}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-4">
              <h2 className="font-semibold text-white">Blocked Attack Breakdown</h2>
              {data.attackBreakdown.length === 0 ? (
                <p className="text-xs text-slate-400">
                  No blocked attacks recorded yet. Run scenarios in the Attack Simulator!
                </p>
              ) : (
                <div className="space-y-3">
                  {data.attackBreakdown.map((item) => (
                    <div key={item.eventType} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="font-mono text-slate-200">{item.eventType}</span>
                        <span className="font-semibold text-rose-300">{item.count}</span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-rose-500"
                          style={{ width: `${(item.count / maxAttackCount) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-4">
              <div className="flex items-center gap-2 font-semibold text-white">
                <Globe className="h-4 w-4 text-cyan-400" />
                Origins &amp; Suspicious IPs
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="py-2 pr-3">IP Address</th>
                      <th className="py-2 pr-3">Location</th>
                      <th className="py-2 pr-3">Blocked</th>
                      <th className="py-2">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {data.suspiciousIps.map((row) => (
                      <tr key={`${row.ip}-${row.location}`}>
                        <td className="py-2 pr-3 font-mono text-slate-200">{row.ip}</td>
                        <td className="py-2 pr-3 text-slate-300">{row.location}</td>
                        <td className="py-2 pr-3 font-semibold text-rose-400">{row.blockedCount}</td>
                        <td className="py-2 text-slate-400">{row.totalEvents}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-4">
            <h2 className="font-semibold text-white">Audit Log Timeline</h2>
            <div className="space-y-2.5 max-h-[460px] overflow-y-auto pr-1">
              {data.auditLogs.length === 0 ? (
                <p className="text-xs text-slate-400">No audit events recorded yet.</p>
              ) : (
                data.auditLogs.map((log) => (
                  <div
                    key={log.id}
                    className="rounded-xl border border-slate-800 bg-slate-950/70 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded border px-2 py-0.5 font-mono text-[11px] font-semibold ${
                            SEVERITY_BADGE[log.severity] || SEVERITY_BADGE.info
                          }`}
                        >
                          {log.eventType}
                        </span>
                        {log.blocked && (
                          <span className="rounded bg-rose-500/20 px-1.5 py-0.5 text-[10px] font-bold text-rose-300">
                            BLOCKED
                          </span>
                        )}
                        {log.riskLevel && (
                          <span className="text-slate-400">
                            Risk: <strong className="uppercase text-slate-200">{log.riskLevel}</strong>
                            {typeof log.riskScore === 'number' ? ` (${log.riskScore})` : ''}
                          </span>
                        )}
                      </div>
                      <div className="text-slate-400">
                        {log.email ? `${log.email} · ` : ''}
                        {log.location} ({log.ip}) · FP {log.deviceFingerprint.slice(0, 10)}…
                      </div>
                    </div>
                    <span className="font-mono text-slate-500 shrink-0">
                      {new Date(log.createdAt).toLocaleString()}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-4">
            <div className="flex items-center gap-2 font-semibold text-white">
              <Mail className="h-4 w-4 text-emerald-400" />
              Nodemailer SMTP Delivery Log
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="py-2 pr-3">Recipient</th>
                    <th className="py-2 pr-3">Template</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {data.emailLogs.map((mail) => (
                    <tr key={mail.id}>
                      <td className="py-2 pr-3 text-slate-200">{mail.to}</td>
                      <td className="py-2 pr-3 font-mono text-slate-300">{mail.template}</td>
                      <td className="py-2 pr-3">
                        <span
                          className={`rounded px-2 py-0.5 text-[11px] font-medium ${
                            mail.status === 'sent'
                              ? 'bg-emerald-500/15 text-emerald-300'
                              : 'bg-rose-500/15 text-rose-300'
                          }`}
                        >
                          {mail.status.toUpperCase()}
                        </span>
                      </td>
                      <td className="py-2 text-slate-400">
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

function KpiCard({
  label,
  value,
  icon,
  highlight,
}: {
  label: string
  value: number
  icon: React.ReactNode
  highlight?: 'rose'
}) {
  return (
    <div
      className={`rounded-xl border p-4 space-y-2 ${
        highlight === 'rose'
          ? 'border-rose-500/30 bg-rose-500/5'
          : 'border-slate-800 bg-slate-900/60'
      }`}
    >
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>{label}</span>
        {icon}
      </div>
      <div className="text-2xl font-bold text-white">{value}</div>
    </div>
  )
}
