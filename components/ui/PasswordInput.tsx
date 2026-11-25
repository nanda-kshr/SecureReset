'use client'

import { forwardRef, useEffect, useId, useState } from 'react'
import { CheckCircle2, Circle, Eye, EyeOff, ShieldAlert, ShieldCheck } from 'lucide-react'
import { Field } from './Field'

export interface PasswordChecklistItem {
  id: string
  label: string
  met: boolean
}

export interface PasswordStrengthInfo {
  score: number // 0 - 4
  acceptable: boolean
  cracksDisplay?: string
  feedback?: string[]
  breached?: boolean
  breachCount?: number
  reused?: boolean
}

export interface PasswordInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string
  helperText?: string
  error?: string | null
  labelAction?: React.ReactNode
  showStrengthMeter?: boolean
  autoCheckStrength?: boolean
  userInputs?: string[]
  strengthInfo?: PasswordStrengthInfo | null
  checklistItems?: PasswordChecklistItem[]
  minLengthRule?: number
  containerClassName?: string
}

const SCORE_LABELS = ['Very weak', 'Weak', 'Fair', 'Strong', 'Very strong']
const SCORE_BAR_COLORS = [
  'bg-[var(--danger-solid)]',
  'bg-[var(--danger-solid)]',
  'bg-[var(--warning-solid)]',
  'bg-[var(--success-solid)]',
  'bg-[var(--success-solid)]',
]

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(function PasswordInput(
  {
    id,
    label,
    helperText,
    error,
    labelAction,
    showStrengthMeter = false,
    autoCheckStrength = false,
    userInputs = [],
    strengthInfo,
    checklistItems,
    minLengthRule = 10,
    required,
    disabled,
    value,
    onChange,
    className = '',
    containerClassName = '',
    ...props
  },
  ref
) {
  const generatedId = useId()
  const inputId = id || generatedId
  const [visible, setVisible] = useState(false)
  const [fetchedCheck, setFetchedCheck] = useState<PasswordStrengthInfo | null>(null)
  const [checking, setChecking] = useState(false)

  const stringValue = typeof value === 'string' ? value : ''

  useEffect(() => {
    if (!autoCheckStrength || !stringValue) {
      return
    }
    let cancelled = false
    const timer = setTimeout(async () => {
      setChecking(true)
      try {
        const res = await fetch('/api/auth/password-check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: stringValue, userInputs }),
        })
        if (res.ok && !cancelled) {
          setFetchedCheck(await res.json())
        }
      } catch {
        // Ignore transient network errors during live check
      } finally {
        if (!cancelled) setChecking(false)
      }
    }, 300)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [autoCheckStrength, stringValue, userInputs])

  const activeStrength = strengthInfo !== undefined ? strengthInfo : stringValue ? fetchedCheck : null

  const defaultChecklist: PasswordChecklistItem[] = checklistItems ?? [
    {
      id: 'length',
      label: `At least ${minLengthRule} characters`,
      met: stringValue.length >= minLengthRule,
    },
    {
      id: 'not-breached',
      label: 'Not found in known data breaches',
      met: Boolean(activeStrength && !activeStrength.breached),
    },
    {
      id: 'strength',
      label: 'Hard to guess (passphrase or mixed words)',
      met: Boolean(activeStrength && activeStrength.score >= 3),
    },
  ]

  const describedBy =
    [error ? `${inputId}-error` : null, helperText && !error ? `${inputId}-helper` : null]
      .filter(Boolean)
      .join(' ') || undefined

  return (
    <Field
      id={inputId}
      label={label}
      required={required}
      helperText={helperText}
      error={error}
      labelAction={labelAction}
      className={containerClassName}
    >
      <div className="relative flex items-center">
        <input
          ref={ref}
          id={inputId}
          type={visible ? 'text' : 'password'}
          required={required}
          disabled={disabled}
          value={value}
          onChange={onChange}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={describedBy}
          className={`sr-transition w-full h-10 rounded-[var(--radius-control)] border bg-[var(--bg-surface)] pl-3 pr-11 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] disabled:opacity-55 disabled:cursor-not-allowed ${
            error
              ? 'border-[var(--danger-solid)] focus:border-[var(--danger-solid)]'
              : 'border-[var(--border-default)] hover:border-[var(--border-strong)] focus:border-[var(--primary)]'
          } ${className}`}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          disabled={disabled}
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          className="sr-transition absolute right-1.5 inline-flex items-center justify-center h-7 w-8 rounded-[6px] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-subtle)] cursor-pointer disabled:opacity-50"
        >
          {visible ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
        </button>
      </div>

      {showStrengthMeter && stringValue.length > 0 && (
        <div
          aria-live="polite"
          className="mt-2 rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--bg-surface-subtle)] p-3 space-y-2.5"
        >
          <div className="grid grid-cols-4 gap-1.5" aria-hidden="true">
            {[0, 1, 2, 3].map((idx) => (
              <div
                key={idx}
                className={`h-1.5 rounded-full sr-transition ${
                  activeStrength && activeStrength.score > idx
                    ? SCORE_BAR_COLORS[activeStrength.score]
                    : 'bg-[var(--border-default)]'
                }`}
              />
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="text-[var(--text-secondary)] font-medium">
              {checking
                ? 'Checking strength and breach status...'
                : activeStrength
                  ? `Strength: ${SCORE_LABELS[activeStrength.score] || 'Unknown'}${
                      activeStrength.cracksDisplay ? ` · Est. ${activeStrength.cracksDisplay}` : ''
                    }`
                  : 'Evaluating password...'}
            </span>

            {activeStrength && !checking && (
              activeStrength.breached ? (
                <span className="inline-flex items-center gap-1 font-medium text-[var(--danger-text)]">
                  <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>
                    Found in {activeStrength.breachCount?.toLocaleString() ?? 'known'} breaches
                  </span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 font-medium text-[var(--success-text)]">
                  <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Not in known breaches</span>
                </span>
              )
            )}
          </div>

          <ul className="space-y-1 text-xs">
            {defaultChecklist.map((item) => (
              <li
                key={item.id}
                className={`flex items-center gap-1.5 ${
                  item.met ? 'text-[var(--success-text)]' : 'text-[var(--text-muted)]'
                }`}
              >
                {item.met ? (
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                ) : (
                  <Circle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                )}
                <span>{item.label}</span>
              </li>
            ))}
          </ul>

          {activeStrength?.feedback && activeStrength.feedback.length > 0 && activeStrength.score < 3 && (
            <p className="text-xs text-[var(--warning-text)] leading-normal">
              {activeStrength.feedback[0]}
            </p>
          )}
        </div>
      )}
    </Field>
  )
})
