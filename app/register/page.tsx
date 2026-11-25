'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FormEvent, useState } from 'react'
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
    <div className="max-w-md mx-auto">
      <div className="rounded-md border border-zinc-200 bg-white p-7 sm:p-8 space-y-6 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
        <div className="space-y-1.5 border-b border-zinc-100 pb-4">
          <div className="text-[11px] font-mono uppercase tracking-wider text-zinc-500">
            Account Enrollment
          </div>
          <h1 className="font-serif text-2xl font-medium text-zinc-950">Create an account</h1>
          <p className="text-xs text-zinc-600">
            Your browser, IP, and region will establish your initial trusted device baseline.
          </p>
        </div>

        {error && (
          <div role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-800">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="name" className="block text-sm font-medium text-zinc-800">
              Full Name
            </label>
            <input
              id="name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Aarav Sharma"
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 placeholder-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
            />
          </div>

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

          <PasswordStrengthField
            id="password"
            label="Master Password"
            value={password}
            onChange={setPassword}
            userInputs={[name, email]}
          />

          <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4 space-y-3">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-600">
              Risk-Escalation Security Question (Optional)
            </div>
            <div className="space-y-1">
              <label htmlFor="sec-q" className="block text-xs text-zinc-600">
                Question
              </label>
              <select
                id="sec-q"
                value={securityQuestion}
                onChange={(e) => setSecurityQuestion(e.target.value)}
                className="w-full rounded-md border border-zinc-300 bg-white px-2.5 py-2 text-xs text-zinc-900 focus:border-zinc-900 focus:outline-none"
              >
                {PRESET_QUESTIONS.map((q) => (
                  <option key={q} value={q}>
                    {q}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label htmlFor="sec-a" className="block text-xs text-zinc-600">
                Answer (hashed with bcrypt)
              </label>
              <input
                id="sec-a"
                type="text"
                value={securityAnswer}
                onChange={(e) => setSecurityAnswer(e.target.value)}
                placeholder="Optional — configurable later in Account"
                className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 placeholder-zinc-400 focus:border-zinc-900 focus:outline-none"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-zinc-950 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 cursor-pointer transition-colors"
          >
            {submitting ? 'Creating Account...' : 'Create Account'}
          </button>
        </form>

        <p className="text-center text-xs text-zinc-500">
          Already registered?{' '}
          <Link href="/login" className="font-medium text-zinc-950 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
