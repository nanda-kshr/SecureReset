'use client'

import Link from 'next/link'
import { FormEvent, useState } from 'react'
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
    <div className="max-w-md mx-auto space-y-4">
      <DemoContextSwitcher />

      <div className="rounded-md border border-zinc-200 bg-white p-7 sm:p-8 space-y-6 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
        <div className="space-y-1.5 border-b border-zinc-100 pb-4">
          <div className="text-[11px] font-mono uppercase tracking-wider text-zinc-500">
            Stage 01 · Recovery Request
          </div>
          <h1 className="font-serif text-2xl font-medium text-zinc-950">Reset your password</h1>
          <p className="text-xs text-zinc-600 leading-relaxed">
            Responses are identical regardless of account existence to prevent enumeration. Valid
            accounts receive a 256-bit device-bound link and 6-digit OTP via SMTP.
          </p>
        </div>

        {error && (
          <div role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-800">
            {error}
          </div>
        )}

        {message && (
          <div role="status" className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-900 space-y-1.5">
            <div className="font-semibold">Request Acknowledged</div>
            <p className="leading-relaxed">{message}</p>
            <p className="text-emerald-800">
              Delivery logs are available in the{' '}
              <Link href="/security-dashboard" className="font-semibold underline">
                Security Audit Console
              </Link>.
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="email" className="block text-sm font-medium text-zinc-800">
              Account Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 placeholder-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
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
            className="w-full rounded-md bg-zinc-950 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 cursor-pointer transition-colors"
          >
            {submitting ? 'Processing...' : 'Send Reset Instructions'}
          </button>
        </form>
      </div>
    </div>
  )
}
