'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { FormEvent, Suspense, useCallback, useEffect, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  KeyRound,
  Lock,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react'
import { secureFetch } from '@/lib/client/api'
import { CaptchaBox, CaptchaData } from '@/components/CaptchaBox'
import { PasswordStrengthField } from '@/components/PasswordStrengthField'
import { DemoContextSwitcher } from '@/components/DemoContextSwitcher'

interface InspectResult {
  valid: boolean
  email: string
  riskLevel: 'low' | 'medium' | 'high'
  riskScore: number
  riskFactors: string[]
  extraCheckRequired: 'none' | 'security_question' | 'totp' | 'both'
  extraCheckPassed: boolean
  otpVerified: boolean
  securityQuestionText: string | null
  requiresCaptcha: boolean
  captcha?: CaptchaData
  otpAttemptsRemaining: number
  lockedUntil: string | null
  expiresAt: string
}

const RISK_STYLES = {
  low: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
  medium: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
  high: 'border-rose-500/40 bg-rose-500/10 text-rose-300',
}

function ResetPasswordContent() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token') || ''

  const [loading, setLoading] = useState(true)
  const [inspectError, setInspectError] = useState<string | null>(null)
  const [state, setState] = useState<InspectResult | null>(null)

  const [otp, setOtp] = useState('')
  const [captcha, setCaptcha] = useState<CaptchaData | null>(null)
  const [captchaAnswer, setCaptchaAnswer] = useState('')

  const [securityAnswer, setSecurityAnswer] = useState('')
  const [totpCode, setTotpCode] = useState('')

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const [stepError, setStepError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [completedInfo, setCompletedInfo] = useState<{
    message: string
    revokedSessionsCount: number
  } | null>(null)

  const inspectToken = useCallback(async () => {
    if (!token) {
      setInspectError('Missing reset token in URL. Open the link from your reset email.')
      setLoading(false)
      return
    }
    setLoading(true)
    setInspectError(null)
    try {
      const res = await secureFetch('/api/auth/reset-verify', {
        method: 'POST',
        body: JSON.stringify({ action: 'inspect', token }),
      })
      const data = await res.json()
      if (!res.ok) {
        setInspectError(data.error || 'Reset link is invalid or expired.')
        setState(null)
        return
      }
      setState(data)
      if (data.requiresCaptcha && data.captcha) {
        setCaptcha(data.captcha)
      }
    } catch {
      setInspectError('Unable to verify reset token.')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    let cancelled = false
    if (!token) {
      Promise.resolve().then(() => {
        if (cancelled) return
        setInspectError('Missing reset token in URL. Open the link from your reset email.')
        setLoading(false)
      })
      return () => {
        cancelled = true
      }
    }
    secureFetch('/api/auth/reset-verify', {
      method: 'POST',
      body: JSON.stringify({ action: 'inspect', token }),
    })
      .then(async (res) => ({ ok: res.ok, data: await res.json() }))
      .then(({ ok, data }) => {
        if (cancelled) return
        if (!ok) {
          setInspectError(data.error || 'Reset link is invalid or expired.')
          setState(null)
          return
        }
        setState(data)
        if (data.requiresCaptcha && data.captcha) {
          setCaptcha(data.captcha)
        }
      })
      .catch(() => {
        if (!cancelled) setInspectError('Unable to verify reset token.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [token])

  async function refreshCaptcha() {
    const res = await fetch('/api/auth/captcha')
    if (res.ok) {
      setCaptcha(await res.json())
      setCaptchaAnswer('')
    }
  }

  async function handleVerifyOtp(e: FormEvent) {
    e.preventDefault()
    setStepError(null)
    setSubmitting(true)
    try {
      const res = await secureFetch('/api/auth/reset-verify', {
        method: 'POST',
        body: JSON.stringify({
          action: 'verify-otp',
          token,
          otp,
          captchaToken: captcha?.captchaToken,
          captchaAnswer: captcha ? captchaAnswer : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setStepError(data.error || 'OTP verification failed.')
        if (data.requiresCaptcha && data.captcha) {
          setCaptcha(data.captcha)
          setCaptchaAnswer('')
        }
        await inspectToken()
        return
      }
      setCaptcha(null)
      setCaptchaAnswer('')
      setState((prev) =>
        prev
          ? {
              ...prev,
              otpVerified: true,
              extraCheckPassed: data.extraCheckPassed,
            }
          : prev
      )
    } catch {
      setStepError('Network error verifying OTP.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleVerifyExtra(e: FormEvent) {
    e.preventDefault()
    setStepError(null)
    setSubmitting(true)
    try {
      const res = await secureFetch('/api/auth/reset-verify', {
        method: 'POST',
        body: JSON.stringify({
          action: 'verify-extra',
          token,
          securityAnswer: securityAnswer || undefined,
          totpCode: totpCode || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setStepError(data.error || 'Additional verification failed.')
        return
      }
      setState((prev) => (prev ? { ...prev, extraCheckPassed: true } : prev))
    } catch {
      setStepError('Network error during step-up verification.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleCompleteReset(e: FormEvent) {
    e.preventDefault()
    setStepError(null)
    if (newPassword !== confirmPassword) {
      setStepError('Passwords do not match.')
      return
    }
    setSubmitting(true)
    try {
      const res = await secureFetch('/api/auth/reset-complete', {
        method: 'POST',
        body: JSON.stringify({ token, newPassword }),
      })
      const data = await res.json()
      if (!res.ok) {
        setStepError(data.error || 'Could not update password.')
        return
      }
      setCompletedInfo({
        message: data.message,
        revokedSessionsCount: data.revokedSessionsCount ?? 0,
      })
    } catch {
      setStepError('Network error completing password reset.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-xl mx-auto space-y-4">
      <DemoContextSwitcher />

      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 sm:p-8 space-y-6">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 text-emerald-400 text-xs font-semibold uppercase tracking-wider">
            <KeyRound className="h-4 w-4" />
            Multi-Layer Reset Verification
          </div>
          <h1 className="text-2xl font-bold text-white">Verify &amp; Set New Password</h1>
        </div>

        {loading && (
          <div className="py-8 text-center text-sm text-slate-400">
            Validating 256-bit token hash &amp; device binding...
          </div>
        )}

        {!loading && inspectError && (
          <div role="alert" className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-5 space-y-3">
            <div className="flex items-center gap-2 font-semibold text-rose-300">
              <ShieldAlert className="h-5 w-5" />
              Reset Link Blocked / Invalid
            </div>
            <p className="text-sm text-rose-200">{inspectError}</p>
            <div className="flex gap-3 pt-1">
              <Link
                href="/forgot-password"
                className="rounded-lg bg-slate-100 px-3.5 py-2 text-xs font-semibold text-slate-950 hover:bg-white"
              >
                Request New Reset Link
              </Link>
              <button
                type="button"
                onClick={inspectToken}
                className="rounded-lg border border-slate-700 px-3.5 py-2 text-xs text-slate-200 hover:bg-slate-800 cursor-pointer"
              >
                Re-check Origin
              </button>
            </div>
          </div>
        )}

        {completedInfo && (
          <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-5 space-y-3">
            <div className="flex items-center gap-2 font-semibold text-emerald-300">
              <CheckCircle2 className="h-5 w-5" />
              Password Reset Complete
            </div>
            <p className="text-sm text-slate-200">{completedInfo.message}</p>
            <ul className="text-xs text-slate-300 space-y-1 list-disc list-inside">
              <li>Single-use token invalidated</li>
              <li>{completedInfo.revokedSessionsCount} existing session(s) revoked</li>
              <li>Security alert email dispatched via Nodemailer</li>
              <li>Audit log event recorded</li>
            </ul>
            <div className="pt-2">
              <Link
                href="/login"
                className="inline-block rounded-lg bg-emerald-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-400"
              >
                Sign in with New Password →
              </Link>
            </div>
          </div>
        )}

        {!loading && state && !completedInfo && (
          <>
            <div className={`rounded-xl border p-4 space-y-2 ${RISK_STYLES[state.riskLevel]}`}>
              <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider">
                <span className="flex items-center gap-1.5">
                  {state.riskLevel === 'low' ? (
                    <ShieldCheck className="h-4 w-4" />
                  ) : (
                    <AlertTriangle className="h-4 w-4" />
                  )}
                  Risk Assessment: {state.riskLevel} ({state.riskScore}/100)
                </span>
                <span>Account: {state.email}</span>
              </div>
              <ul className="text-xs space-y-0.5 opacity-90 list-disc list-inside">
                {state.riskFactors.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </div>

            {stepError && (
              <div role="alert" className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200">
                {stepError}
              </div>
            )}

            {!state.otpVerified && (
              <form onSubmit={handleVerifyOtp} className="space-y-4">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label htmlFor="otp" className="block text-sm font-medium text-slate-200">
                      Layer 2 · Enter 6-Digit Email OTP
                    </label>
                    <span className="text-xs text-slate-400">
                      {state.otpAttemptsRemaining} attempt(s) left
                    </span>
                  </div>
                  <input
                    id="otp"
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    required
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                    placeholder="123456"
                    className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3.5 py-2.5 text-center text-lg font-mono tracking-[0.4em] text-slate-100 placeholder-slate-600 focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                {captcha && (
                  <CaptchaBox
                    captcha={captcha}
                    answer={captchaAnswer}
                    onAnswerChange={setCaptchaAnswer}
                    onRefresh={refreshCaptcha}
                  />
                )}

                <button
                  type="submit"
                  disabled={submitting || Boolean(state.lockedUntil)}
                  className="w-full rounded-lg bg-emerald-500 py-2.5 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50 cursor-pointer"
                >
                  {state.lockedUntil
                    ? 'Temporarily Locked'
                    : submitting
                      ? 'Verifying OTP...'
                      : 'Verify 6-Digit OTP'}
                </button>
              </form>
            )}

            {state.otpVerified && !state.extraCheckPassed && (
              <form onSubmit={handleVerifyExtra} className="space-y-4">
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-200 flex items-center gap-2">
                  <Lock className="h-4 w-4 shrink-0" />
                  <span>
                    Adaptive Step-Up Required ({state.riskLevel.toUpperCase()} Risk): verify your
                    secondary factor below.
                  </span>
                </div>

                {(state.extraCheckRequired === 'security_question' ||
                  state.extraCheckRequired === 'both') && (
                  <div className="space-y-1.5">
                    <label htmlFor="sec-answer" className="block text-sm font-medium text-slate-200">
                      {state.securityQuestionText || 'Security Question'}
                    </label>
                    <input
                      id="sec-answer"
                      type="text"
                      required
                      value={securityAnswer}
                      onChange={(e) => setSecurityAnswer(e.target.value)}
                      placeholder="Your security answer"
                      className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3.5 py-2.5 text-sm text-slate-100 focus:border-amber-400 focus:outline-none"
                    />
                  </div>
                )}

                {(state.extraCheckRequired === 'totp' || state.extraCheckRequired === 'both') && (
                  <div className="space-y-1.5">
                    <label htmlFor="totp-stepup" className="block text-sm font-medium text-slate-200">
                      Authenticator App (TOTP) 6-Digit Code
                    </label>
                    <input
                      id="totp-stepup"
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      required
                      value={totpCode}
                      onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                      placeholder="6-digit code"
                      className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3.5 py-2.5 text-sm font-mono tracking-widest text-slate-100 focus:border-amber-400 focus:outline-none"
                    />
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full rounded-lg bg-amber-400 py-2.5 text-sm font-semibold text-slate-950 hover:bg-amber-300 disabled:opacity-50 cursor-pointer"
                >
                  {submitting ? 'Checking Factor...' : 'Verify Step-Up Factor'}
                </button>
              </form>
            )}

            {state.otpVerified && state.extraCheckPassed && (
              <form onSubmit={handleCompleteReset} className="space-y-4">
                <PasswordStrengthField
                  id="new-password"
                  label="Layer 4 · Set New Strong Password"
                  value={newPassword}
                  onChange={setNewPassword}
                  userInputs={[state.email]}
                />

                <div className="space-y-1.5">
                  <label htmlFor="confirm-pw" className="block text-sm font-medium text-slate-200">
                    Confirm New Password
                  </label>
                  <input
                    id="confirm-pw"
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter new password"
                    className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3.5 py-2.5 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full rounded-lg bg-emerald-500 py-2.5 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50 cursor-pointer"
                >
                  {submitting ? 'Updating Password...' : 'Update Password & Revoke Old Sessions'}
                </button>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-xl mx-auto py-12 text-center text-sm text-slate-400">
          Loading reset verification...
        </div>
      }
    >
      <ResetPasswordContent />
    </Suspense>
  )
}
