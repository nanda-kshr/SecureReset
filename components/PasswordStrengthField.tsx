'use client'

import { useEffect, useState } from 'react'

interface PasswordCheckData {
  score: number
  acceptable: boolean
  cracksDisplay: string
  feedback: string[]
  breached: boolean
  breachCount: number
}

interface PasswordStrengthFieldProps {
  id: string
  label: string
  value: string
  onChange: (val: string) => void
  userInputs?: string[]
  placeholder?: string
}

const SCORE_LABELS = ['Very Weak', 'Weak', 'Fair', 'Strong', 'Very Strong']
const SCORE_COLORS = [
  'bg-rose-600',
  'bg-orange-500',
  'bg-amber-500',
  'bg-emerald-600',
  'bg-emerald-700',
]

export function PasswordStrengthField({
  id,
  label,
  value,
  onChange,
  userInputs = [],
  placeholder = 'Minimum 10 characters, unique passphrase',
}: PasswordStrengthFieldProps) {
  const [check, setCheck] = useState<PasswordCheckData | null>(null)
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    if (!value) {
      return
    }
    const timer = setTimeout(async () => {
      setChecking(true)
      try {
        const res = await fetch('/api/auth/password-check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: value, userInputs }),
        })
        if (res.ok) {
          setCheck(await res.json())
        }
      } catch {
        // Ignore transient errors
      } finally {
        setChecking(false)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [value, userInputs])

  const activeCheck = value ? check : null

  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-medium text-zinc-800">
        {label}
      </label>
      <input
        id={id}
        type="password"
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 placeholder-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
      />

      {value && (
        <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 space-y-2">
          <div className="grid grid-cols-4 gap-1.5">
            {[0, 1, 2, 3].map((idx) => (
              <div
                key={idx}
                className={`h-1 rounded-full transition-colors ${
                  activeCheck && activeCheck.score > idx
                    ? SCORE_COLORS[activeCheck.score]
                    : 'bg-zinc-200'
                }`}
              />
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="text-zinc-600">
              {checking
                ? 'Evaluating strength & HIBP k-anonymity...'
                : activeCheck
                  ? `${SCORE_LABELS[activeCheck.score]} (${activeCheck.score}/4) · Crack estimate: ${activeCheck.cracksDisplay}`
                  : 'Evaluating...'}
            </span>
            {activeCheck && !checking && (
              activeCheck.breached ? (
                <span className="font-medium text-rose-700">
                  Breached ({activeCheck.breachCount.toLocaleString()} exposures)
                </span>
              ) : (
                <span className="font-medium text-emerald-700">Clear in HIBP</span>
              )
            )}
          </div>

          {activeCheck?.feedback && activeCheck.feedback.length > 0 && activeCheck.score < 3 && (
            <p className="text-xs text-amber-800">{activeCheck.feedback[0]}</p>
          )}
        </div>
      )}
    </div>
  )
}
