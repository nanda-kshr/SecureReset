'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FormEvent, useState } from 'react'
import { LogIn } from 'lucide-react'
import { secureFetch } from '@/lib/client/api'
import { CaptchaBox, CaptchaData } from '@/components/CaptchaBox'
import { DemoContextSwitcher } from '@/components/DemoContextSwitcher'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [totpCode, setTotpCode] = useState('')
  const [requiresTotp, setRequiresTotp] = useState(false)
  const [captcha, setCaptcha] = useState<CaptchaData | null>(null)
  const [captchaAnswer, setCaptchaAnswer] = useState('')
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
    setSubmitting(true)

    try {
      const res = await secureFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email,
          password,
          totpCode: requiresTotp ? totpCode : undefined,
          captchaToken: captcha?.captchaToken,
          captchaAnswer: captcha ? captchaAnswer : undefined,
        }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Login failed.')
        if (data.requiresTotp) setRequiresTotp(true)
        if (data.requiresCaptcha && data.captcha) {
          setCaptcha(data.captcha)
          setCaptchaAnswer('')
        }
        return
      }

      router.push('/dashboard')
      router.refresh()
    } catch {
      setError('Network error during login.')
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
            <LogIn className="h-4 w-4" />
            Account Sign In
          </div>
          <h1 className="text-2xl font-bold text-white">Welcome back</h1>
          <p className="text-sm text-slate-400">
            Authenticated sessions use HttpOnly, SameSite cookies and record device trust telemetry.
          </p>
        </div>

        {error && (
          <div role="alert" className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="email" className="block text-sm font-medium text-slate-200">
              Email Address
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

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="password" className="block text-sm font-medium text-slate-200">
                Password
              </label>
              <Link href="/forgot-password" className="text-xs text-emerald-400 hover:underline">
                Forgot password?
              </Link>
            </div>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
            />
          </div>

          {requiresTotp && (
            <div className="space-y-1.5">
              <label htmlFor="totp" className="block text-sm font-medium text-cyan-300">
                Authenticator (TOTP) 6-Digit Code
              </label>
              <input
                id="totp"
                type="text"
                inputMode="numeric"
                required
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value)}
                placeholder="123456"
                className="w-full rounded-lg border border-cyan-500/50 bg-slate-900 px-3.5 py-2.5 text-sm tracking-widest text-slate-100 focus:border-cyan-400 focus:outline-none"
              />
            </div>
          )}

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
            {submitting ? 'Signing In...' : 'Sign In'}
          </button>
        </form>

        <p className="text-center text-xs text-slate-400">
          Need an account?{' '}
          <Link href="/register" className="text-emerald-400 hover:underline">
            Register
          </Link>
        </p>
      </div>
    </div>
  )
}
