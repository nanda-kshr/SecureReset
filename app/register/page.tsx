'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FormEvent, useState } from 'react'
import { UserPlus } from 'lucide-react'
import { secureFetch } from '@/lib/client/api'
import { PasswordStrengthField } from '@/components/PasswordStrengthField'

const PRESET_QUESTIONS = [
  'What is the name of your first school?',
  'In what city were your parents married?',
  'What was the model of your first car?',
  'What is the name of your childhood best friend?',
]

export default function RegisterPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [securityQuestion, setSecurityQuestion] = useState(PRESET_QUESTIONS[0])
  const [securityAnswer, setSecurityAnswer] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      const res = await secureFetch('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          name,
          email,
          password,
          securityQuestion: securityAnswer.trim() ? securityQuestion : undefined,
          securityAnswer: securityAnswer.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Registration failed.')
        return
      }
      router.push('/dashboard')
      router.refresh()
    } catch {
      setError('Network error during registration.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-lg mx-auto">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 sm:p-8 space-y-6">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 text-emerald-400 text-xs font-semibold uppercase tracking-wider">
            <UserPlus className="h-4 w-4" />
            New Account Enrollment
          </div>
          <h1 className="text-2xl font-bold text-white">Create your SecureReset account</h1>
          <p className="text-sm text-slate-400">
            Your initial device, IP, and location will be recorded as your trusted baseline.
          </p>
        </div>

        {error && (
          <div role="alert" className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="name" className="block text-sm font-medium text-slate-200">
              Full Name
            </label>
            <input
              id="name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Aarav Sharma"
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
            />
          </div>

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

          <PasswordStrengthField
            id="password"
            label="Master Password"
            value={password}
            onChange={setPassword}
            userInputs={[name, email]}
          />

          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Risk-Escalation Fallback (Recommended)
            </div>
            <div className="space-y-1.5">
              <label htmlFor="sec-q" className="block text-xs text-slate-300">
                Security Question (asked if medium/high risk reset occurs)
              </label>
              <select
                id="sec-q"
                value={securityQuestion}
                onChange={(e) => setSecurityQuestion(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-100 focus:border-emerald-500 focus:outline-none"
              >
                {PRESET_QUESTIONS.map((q) => (
                  <option key={q} value={q}>
                    {q}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="sec-a" className="block text-xs text-slate-300">
                Answer (stored with bcrypt hash)
              </label>
              <input
                id="sec-a"
                type="text"
                value={securityAnswer}
                onChange={(e) => setSecurityAnswer(e.target.value)}
                placeholder="Optional during signup (can set later in Dashboard)"
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-emerald-500 py-2.5 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50 cursor-pointer transition-colors"
          >
            {submitting ? 'Creating Account...' : 'Create Account'}
          </button>
        </form>

        <p className="text-center text-xs text-slate-400">
          Already enrolled?{' '}
          <Link href="/login" className="text-emerald-400 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
