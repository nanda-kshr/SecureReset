'use client'

import Link from 'next/link'
import { FormEvent, useCallback, useEffect, useState } from 'react'
import { secureFetch } from '@/lib/client/api'
import {
  deleteLocalBrowserKey,
  enrollTrustedBrowserKey,
  getLocalBrowserKeyIds,
} from '@/lib/client/browser-key'

interface UserProfile {
  id: string
  name: string
  email: string
  role: string
  totpEnabled: boolean
  passkeysCount: number
  strongestLoginMethod: 'password' | 'totp' | 'passkey'
  hasSecurityQuestion: boolean
  securityQuestionText: string | null
  probationUntil: string | null
  flaggedSuspicious: boolean
  flaggedReason: string | null
  recoveryCodesRemaining: number
  confirmedChannels: Array<{
    id: string
    type: 'email' | 'backup_email'
    value: string
    verified: boolean
  }>
  trustedBrowserKeys: Array<{
    keyId: string
    label: string
    createdAt: string
    lastUsedAt: string | null
  }>
  knownDevices: Array<{
    fingerprint: string
    label: string
    ip: string
    asn?: string
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

interface ApiKeyItem {
  id: string
  name: string
  prefix: string
  createdAt: string
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<UserProfile | null>(null)
  const [sessions, setSessions] = useState<ActiveSession[]>([])
  const [apiKeys, setApiKeys] = useState<ApiKeyItem[]>([])
  const [localKeyIds, setLocalKeyIds] = useState<string[]>([])

  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [totpSecret, setTotpSecret] = useState<string | null>(null)
  const [totpCode, setTotpCode] = useState('')
  const [disableCode, setDisableCode] = useState('')
  const [question, setQuestion] = useState('What is the name of your first school?')
  const [answer, setAnswer] = useState('')

  const [browserLabel, setBrowserLabel] = useState('Personal Laptop Browser')
  const [generatedCodes, setGeneratedCodes] = useState<string[] | null>(null)
  const [newEmail, setNewEmail] = useState('')
  const [backupEmail, setBackupEmail] = useState('')
  const [apiKeyName, setApiKeyName] = useState('')
  const [newApiKeySecret, setNewApiKeySecret] = useState<string | null>(null)

  const [statusMsg, setStatusMsg] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    try {
      const [meRes, keyRes, localIds] = await Promise.all([
        fetch('/api/auth/me', { credentials: 'include' }),
        fetch('/api/auth/api-keys', { credentials: 'include' }),
        getLocalBrowserKeyIds(),
      ])
      const meData = await meRes.json()
      setUser(meData.user || null)
      setSessions(meData.activeSessions || [])
      setLocalKeyIds(localIds)
      if (meData.user?.securityQuestionText) {
        setQuestion(meData.user.securityQuestionText)
      }
      if (keyRes.ok) {
        const keyData = await keyRes.json()
        setApiKeys(keyData.apiKeys || [])
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  async function runAction(fn: () => Promise<void>) {
    setErrorMsg(null)
    setStatusMsg(null)
    await fn()
  }

  async function handleTrustBrowser(e: FormEvent) {
    e.preventDefault()
    await runAction(async () => {
      try {
        await enrollTrustedBrowserKey(browserLabel, async (payload) => {
          const res = await secureFetch('/api/auth/trusted-browsers', {
            method: 'POST',
            body: JSON.stringify(payload),
          })
          const data = await res.json()
          if (!res.ok) throw new Error(data.error || 'Failed to enroll device key.')
          return { keyId: data.keyId }
        })
        setStatusMsg('Generated non-extractable ECDSA P-256 key in IndexedDB and enrolled public key.')
        await fetchAll()
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Device key enrollment failed.')
      }
    })
  }

  async function handleRevokeBrowserKey(keyId: string) {
    await runAction(async () => {
      const res = await secureFetch('/api/auth/trusted-browsers', {
        method: 'DELETE',
        body: JSON.stringify({ keyId }),
      })
      const data = await res.json()
      if (!res.ok) {
        setErrorMsg(data.error || 'Failed to revoke browser key.')
        return
      }
      await deleteLocalBrowserKey(keyId)
      setStatusMsg('Revoked trusted browser key on server and deleted local IndexedDB handle.')
      await fetchAll()
    })
  }

  async function handleGenerateRecoveryCodes() {
    await runAction(async () => {
      const res = await secureFetch('/api/auth/recovery-codes', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setErrorMsg(data.error || 'Cannot generate recovery codes.')
        return
      }
      setGeneratedCodes(data.codes)
      setStatusMsg('Generated 6 new 80-bit recovery codes. Store them offline — shown once.')
      await fetchAll()
    })
  }

  async function handleChangeEmail(e: FormEvent) {
    e.preventDefault()
    await runAction(async () => {
      const res = await secureFetch('/api/auth/account', {
        method: 'POST',
        body: JSON.stringify({ action: 'change-email', newEmail }),
      })
      const data = await res.json()
      if (!res.ok) {
        setErrorMsg(data.error || 'Unable to change email.')
        return
      }
      setNewEmail('')
      setStatusMsg('Primary email updated.')
      await fetchAll()
    })
  }

  async function handleAddBackupChannel(e: FormEvent) {
    e.preventDefault()
    await runAction(async () => {
      const res = await secureFetch('/api/auth/account', {
        method: 'POST',
        body: JSON.stringify({ action: 'add-backup-channel', backupEmail }),
      })
      const data = await res.json()
      if (!res.ok) {
        setErrorMsg(data.error || 'Unable to add backup channel.')
        return
      }
      setBackupEmail('')
      setStatusMsg('Added confirmed backup notification channel.')
      await fetchAll()
    })
  }

  async function handleCreateApiKey(e: FormEvent) {
    e.preventDefault()
    await runAction(async () => {
      const res = await secureFetch('/api/auth/api-keys', {
        method: 'POST',
        body: JSON.stringify({ name: apiKeyName }),
      })
      const data = await res.json()
      if (!res.ok) {
        setErrorMsg(data.error || 'Unable to create API key.')
        return
      }
      setApiKeyName('')
      setNewApiKeySecret(data.apiKey.secret)
      setStatusMsg('API key created.')
      await fetchAll()
    })
  }

  async function handleExportData() {
    await runAction(async () => {
      const res = await secureFetch('/api/auth/export-data', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setErrorMsg(data.error || 'Data export blocked.')
        return
      }
      setStatusMsg(`Exported account bundle (${data.exportedAt}).`)
    })
  }

  async function startTotpSetup() {
    await runAction(async () => {
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
    })
  }

  async function confirmTotp(e: FormEvent) {
    e.preventDefault()
    await runAction(async () => {
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
      setStatusMsg('Authenticator TOTP enabled.')
      await fetchAll()
    })
  }

  async function disableTotp(e: FormEvent) {
    e.preventDefault()
    await runAction(async () => {
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
      await fetchAll()
    })
  }

  async function saveSecurityQuestion(e: FormEvent) {
    e.preventDefault()
    await runAction(async () => {
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
      setStatusMsg('Security question saved securely.')
      await fetchAll()
    })
  }

  async function togglePasskey(enabled: boolean) {
    await runAction(async () => {
      const res = await secureFetch('/api/auth/security-settings', {
        method: 'POST',
        body: JSON.stringify({ action: 'toggle-passkey', enabled }),
      })
      const data = await res.json()
      if (!res.ok) {
        setErrorMsg(data.error || 'Failed to update passkey setting.')
        return
      }
      setStatusMsg(enabled ? 'Passkey assurance tier enabled (required assurance: 90).' : 'Passkey removed.')
      await fetchAll()
    })
  }

  async function revokeOthers() {
    await runAction(async () => {
      const res = await secureFetch('/api/auth/security-settings', {
        method: 'POST',
        body: JSON.stringify({ action: 'revoke-other-sessions' }),
      })
      const data = await res.json()
      if (res.ok) {
        setStatusMsg(`Revoked ${data.revokedCount} other active session(s).`)
        await fetchAll()
      }
    })
  }

  if (loading) {
    return <div className="py-12 text-center text-xs text-zinc-500">Loading account profile...</div>
  }

  if (!user) {
    return (
      <div className="max-w-md mx-auto rounded-md border border-zinc-200 bg-white p-8 text-center space-y-4">
        <h1 className="font-serif text-xl font-medium text-zinc-950">Authentication Required</h1>
        <p className="text-xs text-zinc-600 leading-relaxed">
          Sign in to manage trusted browser keys, recovery codes, MFA, and post-reset probation.
        </p>
        <div className="flex justify-center gap-3">
          <Link href="/login" className="rounded-md bg-zinc-950 px-4 py-2 text-xs font-medium text-white">
            Sign In
          </Link>
          <Link href="/register" className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-xs font-medium text-zinc-800">
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
            Account Security &amp; Recovery Assurance
          </div>
          <h1 className="font-serif text-3xl font-medium text-zinc-950">{user.name}</h1>
          <p className="text-xs text-zinc-600">
            <span className="font-mono">{user.email}</span> · Role:{' '}
            <span className="uppercase font-mono font-semibold text-zinc-900">{user.role}</span> ·
            Strongest Login:{' '}
            <span className="uppercase font-mono font-semibold text-zinc-900">
              {user.strongestLoginMethod}
            </span>
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/forgot-password"
            className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-xs font-medium text-zinc-900 hover:bg-zinc-50"
          >
            Test Password Reset →
          </Link>
          {user.role === 'admin' && (
            <Link
              href="/security-dashboard"
              className="rounded-md bg-zinc-950 px-4 py-2 text-xs font-medium text-white hover:bg-zinc-800"
            >
              Security Audit →
            </Link>
          )}
        </div>
      </div>

      {user.flaggedSuspicious && (
        <div className="rounded-md border border-rose-300 bg-rose-50 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-rose-900">
          <div>
            <strong>Security Review Required:</strong> {user.flaggedReason || 'A recent recovery attempt was vetoed. Review active sessions and recovery settings.'}
          </div>
          <button
            type="button"
            onClick={() =>
              runAction(async () => {
                await secureFetch('/api/auth/account', {
                  method: 'POST',
                  body: JSON.stringify({ action: 'clear-flag' }),
                })
                await fetchAll()
              })
            }
            className="shrink-0 rounded border border-rose-300 bg-white px-3 py-1.5 font-medium text-rose-900 cursor-pointer"
          >
            Mark Reviewed
          </button>
        </div>
      )}

      {user.probationUntil && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-xs text-amber-950 space-y-1">
          <div className="font-semibold">Post-Reset Security Probation Active</div>
          <p>
            Sensitive mutations (changing email, modifying MFA, enrolling browser keys/passkeys,
            editing recovery settings, creating API keys, and exporting data) are blocked until{' '}
            <strong>{new Date(user.probationUntil).toUTCString()}</strong>. Basic access remains enabled.
          </p>
        </div>
      )}

      {statusMsg && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-900">
          {statusMsg}
        </div>
      )}
      {errorMsg && (
        <div role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800">
          {errorMsg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Phase 3: WebCrypto Trusted Browser Keys */}
        <div className="rounded-md border border-zinc-200 bg-white p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
            <h2 className="text-sm font-semibold text-zinc-950">
              Trusted Browser Keys (WebCrypto ECDSA P-256)
            </h2>
            <span className="font-mono text-xs text-zinc-500">
              {user.trustedBrowserKeys.length} enrolled
            </span>
          </div>
          <p className="text-xs text-zinc-600 leading-relaxed">
            Generates a non-extractable (<code className="font-mono">extractable: false</code>)
            ECDSA P-256 keypair in IndexedDB. Signing a reset challenge boosts assurance by +40.
            Missing/cleared keys safely fall back to cooling-off.
          </p>

          <form onSubmit={handleTrustBrowser} className="flex gap-2">
            <input
              type="text"
              required
              value={browserLabel}
              onChange={(e) => setBrowserLabel(e.target.value)}
              placeholder="Device label"
              className="flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-950"
            />
            <button
              type="submit"
              className="rounded-md bg-zinc-950 px-3.5 py-2 text-xs font-medium text-white hover:bg-zinc-800 cursor-pointer"
            >
              Trust This Personal Device
            </button>
          </form>

          {user.trustedBrowserKeys.length > 0 && (
            <div className="divide-y divide-zinc-200 border border-zinc-200 rounded-md">
              {user.trustedBrowserKeys.map((k) => (
                <div key={k.keyId} className="px-3.5 py-2.5 flex items-center justify-between text-xs">
                  <div>
                    <div className="font-medium text-zinc-900">
                      {k.label}{' '}
                      {localKeyIds.includes(k.keyId) && (
                        <span className="ml-1 rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-800">
                          PRESENT IN BROWSER
                        </span>
                      )}
                    </div>
                    <div className="font-mono text-[11px] text-zinc-500">
                      ID: {k.keyId.slice(0, 12)}…
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRevokeBrowserKey(k.keyId)}
                    className="text-xs font-medium text-rose-700 hover:underline cursor-pointer"
                  >
                    Revoke &amp; Sign Out Key
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Phase 2: 80-bit Recovery Codes */}
        <div className="rounded-md border border-zinc-200 bg-white p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
            <h2 className="text-sm font-semibold text-zinc-950">Single-Use Recovery Codes</h2>
            <span className="font-mono text-xs text-zinc-600">
              {user.recoveryCodesRemaining} unused
            </span>
          </div>
          <p className="text-xs text-zinc-600 leading-relaxed">
            80-bit random recovery codes stored only as HMAC hashes. Presenting an unused code
            during reset raises assurance (+35) to shorten or skip the cooling-off delay.
          </p>
          <button
            type="button"
            onClick={handleGenerateRecoveryCodes}
            className="rounded-md bg-zinc-950 px-4 py-2 text-xs font-medium text-white hover:bg-zinc-800 cursor-pointer"
          >
            {user.recoveryCodesRemaining > 0 ? 'Rotate Recovery Codes' : 'Generate 6 Recovery Codes'}
          </button>

          {generatedCodes && (
            <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3.5 space-y-2">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-700">
                Save These Codes Now (Shown Once)
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 font-mono text-xs text-zinc-950">
                {generatedCodes.map((c) => (
                  <div key={c} className="rounded border border-zinc-200 bg-white px-2.5 py-1">
                    {c}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* MFA: TOTP & Passkey Assurance Tier */}
        <div className="rounded-md border border-zinc-200 bg-white p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
            <h2 className="text-sm font-semibold text-zinc-950">Authenticator (TOTP) &amp; Passkey</h2>
            <span className="font-mono text-xs text-zinc-500">
              {user.totpEnabled ? 'TOTP ON' : 'TOTP OFF'} ·{' '}
              {user.passkeysCount > 0 ? 'PASSKEY ON' : 'NO PASSKEY'}
            </span>
          </div>

          <div className="flex items-center justify-between rounded-md border border-zinc-200 bg-zinc-50 p-3 text-xs">
            <span className="text-zinc-700">
              Hardware Passkey Enrolled (raises required assurance to 90)
            </span>
            <button
              type="button"
              onClick={() => togglePasskey(user.passkeysCount === 0)}
              className="rounded border border-zinc-300 bg-white px-2.5 py-1 font-medium text-zinc-900 cursor-pointer"
            >
              {user.passkeysCount > 0 ? 'Remove Passkey' : 'Enroll Passkey'}
            </button>
          </div>

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
                <img src={qrDataUrl} alt="TOTP QR Code" className="h-32 w-32 rounded border border-zinc-200 bg-white p-1" />
                <code className="block rounded border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 font-mono text-xs text-zinc-900 break-all">
                  {totpSecret}
                </code>
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
                  className="flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-mono"
                />
                <button type="submit" className="rounded-md bg-zinc-950 px-4 py-2 text-xs font-medium text-white cursor-pointer">
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
                className="flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs font-mono"
              />
              <button type="submit" className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800 cursor-pointer">
                Disable TOTP
              </button>
            </form>
          )}
        </div>

        {/* Security Question & Probation-Guarded Account Actions */}
        <div className="rounded-md border border-zinc-200 bg-white p-6 space-y-5">
          <div className="border-b border-zinc-100 pb-3">
            <h2 className="text-sm font-semibold text-zinc-950">
              Account, Channels &amp; Sensitive Actions
            </h2>
          </div>

          <form onSubmit={saveSecurityQuestion} className="space-y-2">
            <div className="text-xs font-medium text-zinc-700">Security Question</div>
            <input
              type="text"
              required
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs text-zinc-900"
            />
            <div className="flex gap-2">
              <input
                type="text"
                required
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="New answer"
                className="flex-1 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs"
              />
              <button type="submit" className="rounded-md bg-zinc-950 px-3 py-1.5 text-xs font-medium text-white cursor-pointer">
                Save
              </button>
            </div>
          </form>

          <form onSubmit={handleChangeEmail} className="flex gap-2">
            <input
              type="email"
              required
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="New primary email (probation-guarded)"
              className="flex-1 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs"
            />
            <button type="submit" className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-900 cursor-pointer">
              Change Email
            </button>
          </form>

          <form onSubmit={handleAddBackupChannel} className="flex gap-2">
            <input
              type="email"
              required
              value={backupEmail}
              onChange={(e) => setBackupEmail(e.target.value)}
              placeholder="Backup notification email"
              className="flex-1 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs"
            />
            <button type="submit" className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-900 cursor-pointer">
              Add Channel
            </button>
          </form>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-zinc-100">
            <form onSubmit={handleCreateApiKey} className="flex gap-2 flex-1">
              <input
                type="text"
                required
                value={apiKeyName}
                onChange={(e) => setApiKeyName(e.target.value)}
                placeholder="API key name"
                className="flex-1 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs"
              />
              <button type="submit" className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-900 cursor-pointer">
                Create API Key
              </button>
            </form>
            <button
              type="button"
              onClick={handleExportData}
              className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-900 cursor-pointer"
            >
              Export Data
            </button>
          </div>

          {newApiKeySecret && (
            <div className="rounded border border-zinc-200 bg-zinc-50 p-2.5 text-xs font-mono break-all">
              New API Key (shown once): {newApiKeySecret}
            </div>
          )}
          {apiKeys.length > 0 && (
            <div className="text-xs text-zinc-500">
              Active API keys: {apiKeys.map((k) => `${k.name} (${k.prefix}…)`).join(', ')}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-md border border-zinc-200 bg-white overflow-hidden">
          <div className="border-b border-zinc-200 bg-zinc-50 px-5 py-3 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-700">
              Active Sessions ({sessions.length})
            </h2>
            {sessions.length > 1 && (
              <button type="button" onClick={revokeOthers} className="text-xs font-medium text-rose-700 hover:underline cursor-pointer">
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
                <span className="text-zinc-500 font-mono">{new Date(s.createdAt).toLocaleTimeString()}</span>
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
                  {d.location} · <span className="font-mono">{d.ip}</span>{' '}
                  {d.asn ? `(${d.asn})` : ''}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
