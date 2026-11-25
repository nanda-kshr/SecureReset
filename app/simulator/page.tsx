'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Terminal, Play, ShieldCheck, ShieldOff, Activity } from 'lucide-react'
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
  title: string
  desc: string
}> = [
  {
    id: 'enumeration',
    title: '1. Account Enumeration Probe',
    desc: 'Probes registered and non-existent emails to test if the reset endpoint leaks valid accounts.',
  },
  {
    id: 'otp_bruteforce',
    title: '2. 6-Digit OTP Brute-Force',
    desc: 'Fires 6 rapid OTP guesses to trigger CAPTCHA enforcement and 15-minute lockout.',
  },
  {
    id: 'token_replay',
    title: '3. Expired / Single-Use Token Replay',
    desc: 'Attempts to replay an already-consumed and expired 256-bit reset token.',
  },
  {
    id: 'device_hijack',
    title: '4. Cross-Device / Foreign IP Hijack',
    desc: 'Evaluates risk score from an attacker IP in Moscow, RU and tests device-binding block.',
  },
  {
    id: 'breached_password',
    title: '5. Breached / Weak Password Injection',
    desc: 'Submits "Password123!" against zxcvbn + HIBP k-anonymity API defense.',
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
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 text-cyan-400 text-xs font-semibold uppercase tracking-wider">
            <Terminal className="h-4 w-4" />
            Capstone Live Demo · Naive vs Hardened
          </div>
          <h1 className="text-2xl font-bold text-white">Attack Simulator</h1>
          <p className="text-sm text-slate-400">
            Execute real controlled attacks against SecureReset&apos;s security controls and inspect
            live audit logs.
          </p>
        </div>

        <Link
          href="/security-dashboard"
          className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20"
        >
          <Activity className="h-4 w-4" />
          View Logged Attacks in SOC →
        </Link>
      </div>

      {error && (
        <div role="alert" className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {SCENARIOS.map((s) => {
          const isRunning = runningId === s.id
          return (
            <div
              key={s.id}
              className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 flex flex-col justify-between gap-4"
            >
              <div className="space-y-1.5">
                <h2 className="font-semibold text-white text-sm">{s.title}</h2>
                <p className="text-xs text-slate-400 leading-relaxed">{s.desc}</p>
              </div>
              <button
                type="button"
                disabled={runningId !== null}
                onClick={() => runScenario(s.id)}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-cyan-500 px-3.5 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-50 cursor-pointer"
              >
                <Play className="h-3.5 w-3.5" />
                {isRunning ? 'Running Attack...' : 'Run Simulation'}
              </button>
            </div>
          )
        })}
      </div>

      {results && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
            <div>
              <h2 className="font-semibold text-white">
                Simulation Report: <span className="font-mono text-cyan-300">{results.scenario}</span>
              </h2>
              <p className="text-xs text-slate-400">
                Simulated Attacker: {results.attackerContext.deviceLabel} ·{' '}
                {results.attackerContext.ip} ({results.attackerContext.location})
              </p>
            </div>
            <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-3 py-1 text-xs font-medium text-emerald-300">
              All events written to MongoDB audit_logs
            </span>
          </div>

          <div className="space-y-3">
            {results.steps.map((st, idx) => (
              <div
                key={`${st.step}-${idx}`}
                className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-xs font-semibold text-slate-200">{st.step}</span>
                  <div className="flex items-center gap-2 text-[11px] font-mono">
                    <span className="rounded bg-slate-800 px-2 py-0.5 text-slate-300">
                      HTTP {st.statusCode}
                    </span>
                    <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-emerald-300">
                      LOG: {st.auditEvent}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-3 space-y-1">
                    <div className="flex items-center gap-1.5 font-semibold text-rose-300">
                      <ShieldOff className="h-3.5 w-3.5" />
                      Naive Reset System (Vulnerable)
                    </div>
                    <p className="text-slate-300">{st.naiveBehavior}</p>
                  </div>
                  <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 space-y-1">
                    <div className="flex items-center gap-1.5 font-semibold text-emerald-300">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      SecureReset (Hardened)
                    </div>
                    <p className="text-slate-200">{st.secureBehavior}</p>
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
