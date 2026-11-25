'use client'

import { useEffect, useState } from 'react'
import { ShieldAlert, ShieldCheck } from 'lucide-react'

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
  'bg-rose-500',
  'bg-orange-500',
  'bg-amber-400',
  'bg-emerald-400',
  'bg-emerald-500',
]

export function PasswordStrengthField({
  id,
  label,
  value,
  onChange,
  userInputs = [],
  placeholder = 'At least 10 chars, unique passphrase',
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
        // Ignore transient network errors during typing
      } finally {
        setChecking(false)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [value, userInputs])

  const activeCheck = value ? check : null

  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-medium text-slate-200">
        {label}
      </label>
      <input
        id={id}
        type="password"
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
      />

      {value && (
        <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-3 space-y-2">
          <div className="grid grid-cols-4 gap-1.5">
            {[0, 1, 2, 3].map((idx) => (
              <div
                key={idx}
                className={`h-1.5 rounded-full transition-colors ${
                  activeCheck && activeCheck.score > idx ? SCORE_COLORS[activeCheck.score] : 'bg-slate-800'
                }`}
              />
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="text-slate-300">
              {checking
                ? 'Checking zxcvbn + HIBP k-anonymity...'
                : activeCheck
                  ? `Strength: ${SCORE_LABELS[activeCheck.score]} (${activeCheck.score}/4) · Crack time: ${activeCheck.cracksDisplay}`
                  : 'Evaluating...'}
            </span>
            {activeCheck && !checking && (
              activeCheck.breached ? (
                <span className="inline-flex items-center gap-1 text-rose-400 font-medium">
                  <ShieldAlert className="h-3.5 w-3.5" />
                  Breached ({activeCheck.breachCount.toLocaleString()} leaks)
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-emerald-400">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Not in HIBP breaches
                </span>
              )
            )}
          </div>

          {activeCheck?.feedback && activeCheck.feedback.length > 0 && activeCheck.score < 3 && (
            <p className="text-xs text-amber-300">{activeCheck.feedback[0]}</p>
          )}
        </div>
      )}
    </div>
  )
}
