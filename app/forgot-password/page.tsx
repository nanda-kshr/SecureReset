'use client'

import Link from 'next/link'
import { FormEvent, useState } from 'react'
import { KeyRound, MailCheck, ShieldAlert } from 'lucide-react'
import { secureFetch } from '@/lib/client/api'
import { CaptchaBox, CaptchaData } from '@/components/CaptchaBox'
import { DemoContextSwitcher } from '@/components/DemoContextSwitcher'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [captcha, setCaptcha] = useState<CaptchaData | null>(null)
  const [captchaAnswer, setCaptchaAnswer] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function refreshCaptcha() {
    const res = await fetch('/api/auth/captcha')
    if (res.ok) {
      setCaptcha(await res.json())
      setCaptchaAnswer('')
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setMessage(null)
    setSubmitting(true)

    try {
      const res = await secureFetch('/api/auth/reset-request', {
        method: 'POST',
        body: JSON.stringify({
          email,
          captchaToken: captcha?.captchaToken,
          captchaAnswer: captcha ? captchaAnswer : undefined,
        }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Unable to process reset request.')
        if (data.requiresCaptcha && data.captcha) {
          setCaptcha(data.captcha)
          setCaptchaAnswer('')
        }
        return
      }

      setMessage(data.message)
      setCaptcha(null)
      setCaptchaAnswer('')
    } catch {
      setError('Network error submitting reset request.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <DemoContextSwitcher />

      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 sm:p-8 space-y-6">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 text-emerald-400 text-xs font-semibold uppercase tracking-wider">
            <KeyRound className="h-4 w-4" />
            Step 1 · Hardened Reset Request
          </div>
          <h1 className="text-2xl font-bold text-white">Reset your password</h1>
          <p className="text-sm text-slate-400">
            Always returns an identical response to prevent account enumeration. Valid accounts
            receive a 256-bit device-bound link and 6-digit OTP via Nodemailer SMTP.
          </p>
        </div>

        {error && (
          <div role="alert" className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200 flex items-start gap-2">
            <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {message && (
          <div role="status" className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm text-emerald-200 space-y-2">
            <div className="flex items-center gap-2 font-semibold text-emerald-300">
              <MailCheck className="h-4 w-4" />
              Anti-Enumeration Response Sent
            </div>
            <p>{message}</p>
            <p className="text-xs text-slate-300">
              Check your email inbox for the 15-minute verification link and 6-digit OTP. You can also view delivery logs in the{' '}
              <Link href="/security-dashboard" className="text-emerald-300 underline">
                Security SOC Dashboard
              </Link>.
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="email" className="block text-sm font-medium text-slate-200">
              Account Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
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
            disabled={submitting}
            className="w-full rounded-lg bg-emerald-500 py-2.5 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50 cursor-pointer transition-colors"
          >
            {submitting ? 'Processing...' : 'Send Reset Instructions'}
          </button>
        </form>
      </div>
    </div>
  )
}
