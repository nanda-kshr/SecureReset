'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FormEvent, useState } from 'react'
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
    <div className="max-w-md mx-auto space-y-4">
      <DemoContextSwitcher />

      <div className="rounded-md border border-zinc-200 bg-white p-7 sm:p-8 space-y-6 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
        <div className="space-y-1.5 border-b border-zinc-100 pb-4">
          <div className="text-[11px] font-mono uppercase tracking-wider text-zinc-500">
            Session Authentication
          </div>
          <h1 className="font-serif text-2xl font-medium text-zinc-950">Sign in</h1>
          <p className="text-xs text-zinc-600">
            Sessions issue HttpOnly, SameSite cookies bound to device telemetry.
          </p>
        </div>

        {error && (
          <div role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-800">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="email" className="block text-sm font-medium text-zinc-800">
              Email Address
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

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="password" className="block text-sm font-medium text-zinc-800">
                Password
              </label>
              <Link href="/forgot-password" className="text-xs font-medium text-zinc-600 hover:text-zinc-950 hover:underline">
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
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 placeholder-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
            />
          </div>

          {requiresTotp && (
            <div className="space-y-1.5">
              <label htmlFor="totp" className="block text-sm font-medium text-zinc-800">
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
                className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-mono tracking-widest text-zinc-950 focus:border-zinc-900 focus:outline-none"
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
            className="w-full rounded-md bg-zinc-950 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 cursor-pointer transition-colors"
          >
            {submitting ? 'Signing In...' : 'Sign In'}
          </button>
        </form>

        <p className="text-center text-xs text-zinc-500">
          Need an account?{' '}
          <Link href="/register" className="font-medium text-zinc-950 hover:underline">
            Register
          </Link>
        </p>
      </div>
    </div>
  )
}
