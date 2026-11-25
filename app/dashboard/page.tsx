'use client'

import Link from 'next/link'
import { FormEvent, useCallback, useEffect, useState } from 'react'
import { ShieldCheck, Smartphone, Laptop, KeyRound, LogOut } from 'lucide-react'
import { secureFetch } from '@/lib/client/api'

interface UserProfile {
  id: string
  name: string
  email: string
  role: string
  totpEnabled: boolean
  hasSecurityQuestion: boolean
  securityQuestionText: string | null
  knownDevices: Array<{
    fingerprint: string
    label: string
    ip: string
    location: string
    lastSeenAt: string
  }>
}

interface ActiveSession {
  id: string
  deviceLabel: string
  ip: string
  location: string
  createdAt: string
  isCurrent: boolean
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<UserProfile | null>(null)
  const [sessions, setSessions] = useState<ActiveSession[]>([])
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [totpSecret, setTotpSecret] = useState<string | null>(null)
  const [totpCode, setTotpCode] = useState('')
  const [disableCode, setDisableCode] = useState('')
  const [question, setQuestion] = useState('What is the name of your first school?')
  const [answer, setAnswer] = useState('')
  const [statusMsg, setStatusMsg] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const fetchProfile = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me', { credentials: 'include' })
      const data = await res.json()
      setUser(data.user || null)
      setSessions(data.activeSessions || [])
      if (data.user?.securityQuestionText) {
        setQuestion(data.user.securityQuestionText)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  const loadProfile = useCallback(async () => {
    setLoading(true)
    await fetchProfile()
  }, [fetchProfile])

  useEffect(() => {
    let cancelled = false
    fetch('/api/auth/me', { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return
        setUser(data.user || null)
        setSessions(data.activeSessions || [])
        if (data.user?.securityQuestionText) {
          setQuestion(data.user.securityQuestionText)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function startTotpSetup() {
    setErrorMsg(null)
    setStatusMsg(null)
    const res = await secureFetch('/api/auth/security-settings', {
      method: 'POST',
      body: JSON.stringify({ action: 'setup-totp' }),
    })
    const data = await res.json()
    if (!res.ok) {
      setErrorMsg(data.error || 'Failed to generate TOTP QR.')
      return
    }
    setQrDataUrl(data.qrDataUrl)
    setTotpSecret(data.secret)
  }

  async function confirmTotp(e: FormEvent) {
    e.preventDefault()
    setErrorMsg(null)
    const res = await secureFetch('/api/auth/security-settings', {
      method: 'POST',
      body: JSON.stringify({ action: 'confirm-totp', code: totpCode }),
    })
    const data = await res.json()
    if (!res.ok) {
      setErrorMsg(data.error || 'Invalid TOTP code.')
      return
    }
    setQrDataUrl(null)
    setTotpSecret(null)
    setTotpCode('')
    setStatusMsg('Authenticator TOTP enabled for high-risk resets and logins.')
    await loadProfile()
  }

  async function disableTotp(e: FormEvent) {
    e.preventDefault()
    setErrorMsg(null)
    const res = await secureFetch('/api/auth/security-settings', {
      method: 'POST',
      body: JSON.stringify({ action: 'disable-totp', code: disableCode }),
    })
    const data = await res.json()
    if (!res.ok) {
      setErrorMsg(data.error || 'Invalid TOTP code.')
      return
    }
    setDisableCode('')
    setStatusMsg('Authenticator TOTP disabled.')
    await loadProfile()
  }

  async function saveSecurityQuestion(e: FormEvent) {
    e.preventDefault()
    setErrorMsg(null)
    const res = await secureFetch('/api/auth/security-settings', {
      method: 'POST',
      body: JSON.stringify({ action: 'set-security-question', question, answer }),
    })
    const data = await res.json()
    if (!res.ok) {
      setErrorMsg(data.error || 'Failed to update security question.')
      return
    }
    setAnswer('')
    setStatusMsg('Security question saved securely (bcrypt hashed).')
    await loadProfile()
  }

  async function revokeOthers() {
    setErrorMsg(null)
    const res = await secureFetch('/api/auth/security-settings', {
      method: 'POST',
      body: JSON.stringify({ action: 'revoke-other-sessions' }),
    })
    const data = await res.json()
    if (res.ok) {
      setStatusMsg(`Revoked ${data.revokedCount} other active session(s).`)
      await loadProfile()
    }
  }

  if (loading) {
    return <div className="py-12 text-center text-sm text-slate-400">Loading security profile...</div>
  }

  if (!user) {
    return (
      <div className="max-w-md mx-auto rounded-2xl border border-slate-800 bg-slate-900/60 p-8 text-center space-y-4">
        <h1 className="text-xl font-bold text-white">Sign in required</h1>
        <p className="text-sm text-slate-400">
          Authenticate to manage TOTP MFA, security questions, trusted devices, and active sessions.
        </p>
        <div className="flex justify-center gap-3">
          <Link
            href="/login"
            className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950"
          >
            Sign In
          </Link>
          <Link
            href="/register"
            className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-200"
          >
            Register
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Account Security Profile</h1>
          <p className="text-sm text-slate-400">
            Signed in as <span className="text-slate-200">{user.email}</span> · Role:{' '}
            <span className="uppercase font-mono text-emerald-400">{user.role}</span>
          </p>
        </div>
        <Link
          href="/forgot-password"
          className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-xs font-medium text-slate-200 hover:border-emerald-500/50"
        >
          <KeyRound className="h-3.5 w-3.5 text-emerald-400" />
          Test Reset Flow
        </Link>
      </div>

      {statusMsg && (
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-200">
          {statusMsg}
        </div>
      )}
      {errorMsg && (
        <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200">
          {errorMsg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-semibold text-white">
              <Smartphone className="h-4 w-4 text-cyan-400" />
              Authenticator App (TOTP)
            </div>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                user.totpEnabled
                  ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                  : 'bg-slate-800 text-slate-400'
              }`}
            >
              {user.totpEnabled ? 'Enabled' : 'Not Configured'}
            </span>
          </div>

          <p className="text-xs text-slate-400">
            High-risk password resets from unfamiliar devices or locations require a 6-digit TOTP
            code from Google Authenticator or Authy.
          </p>

          {!user.totpEnabled && !qrDataUrl && (
            <button
              type="button"
              onClick={startTotpSetup}
              className="rounded-lg bg-cyan-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-400 cursor-pointer"
            >
              Enroll Authenticator QR Code
            </button>
          )}

          {qrDataUrl && (
            <form onSubmit={confirmTotp} className="space-y-3 border-t border-slate-800 pt-4">
              <div className="flex flex-col sm:flex-row items-center gap-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qrDataUrl}
                  alt="TOTP QR Code"
                  className="h-36 w-36 rounded-lg border border-slate-700 bg-white p-1.5"
                />
                <div className="space-y-2 text-xs text-slate-300">
                  <p>Scan this QR code in your Authenticator app, or enter secret manually:</p>
                  <code className="block rounded bg-slate-950 px-2.5 py-1.5 font-mono text-emerald-300 break-all">
                    {totpSecret}
                  </code>
                </div>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  required
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="Enter 6-digit code"
                  className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-mono text-slate-100"
                />
                <button
                  type="submit"
                  className="rounded-lg bg-emerald-500 px-4 py-2 text-xs font-semibold text-slate-950 cursor-pointer"
                >
                  Verify &amp; Enable
                </button>
              </div>
            </form>
          )}

          {user.totpEnabled && (
            <form onSubmit={disableTotp} className="flex gap-2 border-t border-slate-800 pt-4">
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                required
                value={disableCode}
                onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, ''))}
                placeholder="6-digit code to disable"
                className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-mono text-slate-100"
              />
              <button
                type="submit"
                className="rounded-lg border border-rose-500/40 px-3 py-2 text-xs text-rose-300 hover:bg-rose-500/10 cursor-pointer"
              >
                Disable TOTP
              </button>
            </form>
          )}
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-semibold text-white">
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              Security Question Fallback
            </div>
            <span className="text-xs text-slate-400">
              {user.hasSecurityQuestion ? 'Configured' : 'Unset'}
            </span>
          </div>
          <form onSubmit={saveSecurityQuestion} className="space-y-3">
            <input
              type="text"
              required
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100"
            />
            <input
              type="text"
              required
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="New answer (bcrypt hashed)"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
            />
            <button
              type="submit"
              className="rounded-lg bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-white cursor-pointer"
            >
              Save Security Question
            </button>
          </form>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-white">Active Sessions ({sessions.length})</h2>
            {sessions.length > 1 && (
              <button
                type="button"
                onClick={revokeOthers}
                className="inline-flex items-center gap-1 rounded-lg border border-amber-500/40 px-2.5 py-1 text-xs text-amber-300 hover:bg-amber-500/10 cursor-pointer"
              >
                <LogOut className="h-3 w-3" />
                Revoke others
              </button>
            )}
          </div>
          <div className="space-y-2.5">
            {sessions.map((s) => (
              <div
                key={s.id}
                className="rounded-lg border border-slate-800 bg-slate-950/70 p-3 flex items-center justify-between text-xs"
              >
                <div>
                  <div className="font-medium text-slate-200">
                    {s.deviceLabel}{' '}
                    {s.isCurrent && (
                      <span className="ml-1.5 rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] text-emerald-300">
                        CURRENT
                      </span>
                    )}
                  </div>
                  <div className="text-slate-400">
                    {s.location} · IP {s.ip}
                  </div>
                </div>
                <span className="text-slate-500 font-mono">
                  {new Date(s.createdAt).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-4">
          <div className="flex items-center gap-2 font-semibold text-white">
            <Laptop className="h-4 w-4 text-emerald-400" />
            Trusted Device Baseline ({user.knownDevices.length})
          </div>
          <div className="space-y-2.5">
            {user.knownDevices.map((d, idx) => (
              <div
                key={`${d.fingerprint}-${idx}`}
                className="rounded-lg border border-slate-800 bg-slate-950/70 p-3 text-xs space-y-1"
              >
                <div className="flex justify-between">
                  <span className="font-medium text-slate-200">{d.label}</span>
                  <span className="font-mono text-slate-500">{d.fingerprint.slice(0, 12)}…</span>
                </div>
                <div className="text-slate-400">
                  {d.location} · {d.ip}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
