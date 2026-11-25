'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Play } from 'lucide-react'
import { secureFetch } from '@/lib/client/api'

type ScenarioId =
  | 'enumeration'
  | 'otp_bruteforce'
  | 'token_replay'
  | 'device_hijack'
  | 'breached_password'

interface SimulationStep {
  step: string
  naiveBehavior: string
  secureBehavior: string
  blocked: boolean
  statusCode: number
  auditEvent: string
}

interface SimulationResult {
  scenario: ScenarioId
  attackerContext: {
    ip: string
    location: string
    deviceLabel: string
  }
  steps: SimulationStep[]
}

const SCENARIOS: Array<{
  id: ScenarioId
  code: string
  title: string
  desc: string
}> = [
  {
    id: 'enumeration',
    code: 'ATK-01',
    title: 'Account Enumeration Probe',
    desc: 'Probes registered and non-existent emails to verify uniform HTTP 200 anti-enumeration behavior.',
  },
  {
    id: 'otp_bruteforce',
    code: 'ATK-02',
    title: '6-Digit OTP Brute-Force',
    desc: 'Fires 6 rapid OTP guesses to trigger CAPTCHA enforcement at attempt 2 and lockout at attempt 5.',
  },
  {
    id: 'token_replay',
    code: 'ATK-03',
    title: 'Expired / Single-Use Token Replay',
    desc: 'Attempts to replay an already-consumed and expired 256-bit reset token.',
  },
  {
    id: 'device_hijack',
    code: 'ATK-04',
    title: 'Cross-Device & Foreign IP Hijack',
    desc: 'Assesses risk from a foreign IP (Moscow, RU) and tests device-binding enforcement.',
  },
  {
    id: 'breached_password',
    code: 'ATK-05',
    title: 'Breached / Weak Password Injection',
    desc: 'Submits "Password123!" against zxcvbn strength scoring and HIBP k-anonymity screening.',
  },
]

export default function SimulatorPage() {
  const [runningId, setRunningId] = useState<ScenarioId | null>(null)
  const [results, setResults] = useState<SimulationResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function runScenario(scenario: ScenarioId) {
    setRunningId(scenario)
    setError(null)
    try {
      const res = await secureFetch('/api/simulator', {
        method: 'POST',
        body: JSON.stringify({ scenario }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Simulation failed.')
        return
      }
      setResults(data)
    } catch {
      setError('Network error running attack simulation.')
    } finally {
      setRunningId(null)
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-zinc-200 pb-6">
        <div className="space-y-1">
          <div className="text-[11px] font-mono uppercase tracking-wider text-zinc-500">
            Controlled Verification · Naive vs. Hardened
          </div>
          <h1 className="font-serif text-3xl font-medium text-zinc-950">Attack Simulator</h1>
          <p className="text-xs text-zinc-600">
            Execute real attack vectors against SecureReset controls and record events to MongoDB
            audit logs.
          </p>
        </div>

        <Link
          href="/security-dashboard"
          className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-xs font-medium text-zinc-900 hover:bg-zinc-50"
        >
          Inspect Logged Events →
        </Link>
      </div>

      {error && (
        <div role="alert" className="rounded-md border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
          {error}
        </div>
      )}

      <div className="rounded-md border border-zinc-200 bg-white divide-y divide-zinc-200">
        {SCENARIOS.map((s) => {
          const isRunning = runningId === s.id
          return (
            <div
              key={s.id}
              className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2.5">
                  <span className="font-mono text-xs text-zinc-400">{s.code}</span>
                  <h2 className="text-sm font-semibold text-zinc-950">{s.title}</h2>
                </div>
                <p className="text-xs text-zinc-600 max-w-2xl">{s.desc}</p>
              </div>
              <button
                type="button"
                disabled={runningId !== null}
                onClick={() => runScenario(s.id)}
                className="shrink-0 inline-flex items-center justify-center gap-1.5 rounded-md bg-zinc-950 px-4 py-2 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-50 cursor-pointer"
              >
                <Play className="h-3 w-3" />
                {isRunning ? 'Running...' : 'Run Simulation'}
              </button>
            </div>
          )
        })}
      </div>

      {results && (
        <div className="rounded-md border border-zinc-200 bg-white overflow-hidden">
          <div className="border-b border-zinc-200 bg-zinc-50 px-5 py-3.5 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-zinc-950">
                Simulation Report: <span className="font-mono">{results.scenario}</span>
              </h2>
              <p className="text-xs text-zinc-500">
                Simulated Origin: {results.attackerContext.deviceLabel} ·{' '}
                <span className="font-mono">{results.attackerContext.ip}</span> (
                {results.attackerContext.location})
              </p>
            </div>
            <span className="rounded border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-800">
              Persisted to audit_logs
            </span>
          </div>

          <div className="divide-y divide-zinc-200">
            {results.steps.map((st, idx) => (
              <div key={`${st.step}-${idx}`} className="p-5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-xs font-semibold text-zinc-900">{st.step}</span>
                  <div className="flex items-center gap-2 text-[11px] font-mono">
                    <span className="rounded border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-zinc-700">
                      HTTP {st.statusCode}
                    </span>
                    <span className="rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-emerald-800">
                      LOG: {st.auditEvent}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div className="rounded-md border border-rose-200 bg-rose-50/70 p-3.5 space-y-1">
                    <div className="font-semibold text-rose-900">Naive System (Vulnerable)</div>
                    <p className="text-rose-800 leading-relaxed">{st.naiveBehavior}</p>
                  </div>
                  <div className="rounded-md border border-emerald-200 bg-emerald-50/70 p-3.5 space-y-1">
                    <div className="font-semibold text-emerald-950">SecureReset (Hardened)</div>
                    <p className="text-emerald-900 leading-relaxed">{st.secureBehavior}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
