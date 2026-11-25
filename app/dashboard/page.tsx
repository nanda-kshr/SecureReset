'use client'

import Link from 'next/link'
import { FormEvent, useCallback, useEffect, useState } from 'react'
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
    return <div className="py-12 text-center text-xs text-zinc-500">Loading account profile...</div>
  }

  if (!user) {
    return (
      <div className="max-w-md mx-auto rounded-md border border-zinc-200 bg-white p-8 text-center space-y-4">
        <h1 className="font-serif text-xl font-medium text-zinc-950">Authentication Required</h1>
        <p className="text-xs text-zinc-600 leading-relaxed">
          Sign in to configure TOTP MFA, security questions, trusted devices, and active sessions.
        </p>
        <div className="flex justify-center gap-3">
          <Link
            href="/login"
            className="rounded-md bg-zinc-950 px-4 py-2 text-xs font-medium text-white"
          >
            Sign In
          </Link>
          <Link
            href="/register"
            className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-xs font-medium text-zinc-800"
          >
            Register
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-zinc-200 pb-6">
        <div className="space-y-1">
          <div className="text-[11px] font-mono uppercase tracking-wider text-zinc-500">
            Account Security Configuration
          </div>
          <h1 className="font-serif text-3xl font-medium text-zinc-950">{user.name}</h1>
          <p className="text-xs text-zinc-600">
            <span className="font-mono">{user.email}</span> · Role:{' '}
            <span className="uppercase font-mono font-semibold text-zinc-900">{user.role}</span>
          </p>
        </div>
        <Link
          href="/forgot-password"
          className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-xs font-medium text-zinc-900 hover:bg-zinc-50"
        >
          Test Password Reset Flow →
        </Link>
      </div>

      {statusMsg && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-900">
          {statusMsg}
        </div>
      )}
      {errorMsg && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800">
          {errorMsg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-md border border-zinc-200 bg-white p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
            <h2 className="text-sm font-semibold text-zinc-950">Authenticator App (TOTP)</h2>
            <span
              className={`rounded px-2 py-0.5 text-[11px] font-medium border ${
                user.totpEnabled
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-zinc-100 text-zinc-600 border-zinc-200'
              }`}
            >
              {user.totpEnabled ? 'Enabled' : 'Not Configured'}
            </span>
          </div>

          <p className="text-xs text-zinc-600 leading-relaxed">
            High-risk password resets from unfamiliar devices or regions require a 6-digit RFC
            6238 code from Google Authenticator or Authy.
          </p>

          {!user.totpEnabled && !qrDataUrl && (
            <button
              type="button"
              onClick={startTotpSetup}
              className="rounded-md bg-zinc-950 px-4 py-2 text-xs font-medium text-white hover:bg-zinc-800 cursor-pointer"
            >
              Enroll Authenticator QR Code
            </button>
          )}

          {qrDataUrl && (
            <form onSubmit={confirmTotp} className="space-y-3 border-t border-zinc-100 pt-4">
              <div className="flex flex-col sm:flex-row items-center gap-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qrDataUrl}
                  alt="TOTP QR Code"
                  className="h-32 w-32 rounded border border-zinc-200 bg-white p-1"
                />
                <div className="space-y-2 text-xs text-zinc-600">
                  <p>Scan in your authenticator app or enter this base32 secret manually:</p>
                  <code className="block rounded border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 font-mono text-zinc-900 break-all">
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
                  className="flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-mono text-zinc-950"
                />
                <button
                  type="submit"
                  className="rounded-md bg-zinc-950 px-4 py-2 text-xs font-medium text-white cursor-pointer"
                >
                  Verify &amp; Enable
                </button>
              </div>
            </form>
          )}

          {user.totpEnabled && (
            <form onSubmit={disableTotp} className="flex gap-2 border-t border-zinc-100 pt-4">
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                required
                value={disableCode}
                onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, ''))}
                placeholder="6-digit code to disable"
                className="flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs font-mono text-zinc-950"
              />
              <button
                type="submit"
                className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800 hover:bg-rose-100 cursor-pointer"
              >
                Disable TOTP
              </button>
            </form>
          )}
        </div>

        <div className="rounded-md border border-zinc-200 bg-white p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
            <h2 className="text-sm font-semibold text-zinc-950">Security Question Fallback</h2>
            <span className="text-xs text-zinc-500">
              {user.hasSecurityQuestion ? 'Configured' : 'Unset'}
            </span>
          </div>
          <form onSubmit={saveSecurityQuestion} className="space-y-3">
            <input
              type="text"
              required
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-900"
            />
            <input
              type="text"
              required
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="New answer (bcrypt hashed)"
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950"
            />
            <button
              type="submit"
              className="rounded-md bg-zinc-950 px-4 py-2 text-xs font-medium text-white hover:bg-zinc-800 cursor-pointer"
            >
              Save Security Question
            </button>
          </form>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-md border border-zinc-200 bg-white overflow-hidden">
          <div className="border-b border-zinc-200 bg-zinc-50 px-5 py-3 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-700">
              Active Sessions ({sessions.length})
            </h2>
            {sessions.length > 1 && (
              <button
                type="button"
                onClick={revokeOthers}
                className="text-xs font-medium text-rose-700 hover:underline cursor-pointer"
              >
                Revoke others
              </button>
            )}
          </div>
          <div className="divide-y divide-zinc-200">
            {sessions.map((s) => (
              <div key={s.id} className="px-5 py-3 flex items-center justify-between text-xs">
                <div className="space-y-0.5">
                  <div className="font-medium text-zinc-900">
                    {s.deviceLabel}{' '}
                    {s.isCurrent && (
                      <span className="ml-1.5 rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">
                        CURRENT
                      </span>
                    )}
                  </div>
                  <div className="text-zinc-500">
                    {s.location} · <span className="font-mono">{s.ip}</span>
                  </div>
                </div>
                <span className="text-zinc-500 font-mono">
                  {new Date(s.createdAt).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-md border border-zinc-200 bg-white overflow-hidden">
          <div className="border-b border-zinc-200 bg-zinc-50 px-5 py-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-700">
              Trusted Device Baseline ({user.knownDevices.length})
            </h2>
          </div>
          <div className="divide-y divide-zinc-200">
            {user.knownDevices.map((d, idx) => (
              <div key={`${d.fingerprint}-${idx}`} className="px-5 py-3 text-xs space-y-0.5">
                <div className="flex justify-between">
                  <span className="font-medium text-zinc-900">{d.label}</span>
                  <span className="font-mono text-zinc-500">{d.fingerprint.slice(0, 12)}…</span>
                </div>
                <div className="text-zinc-500">
                  {d.location} · <span className="font-mono">{d.ip}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
