'use client'

import { useId, useRef } from 'react'
import { Field } from './Field'

export interface OtpInputProps {
  id?: string
  label?: string
  value: string
  onChange: (value: string) => void
  onComplete?: (code: string) => void
  length?: number
  helperText?: string
  error?: string | null
  disabled?: boolean
  labelAction?: React.ReactNode
}

export function OtpInput({
  id,
  label = 'Verification code',
  value,
  onChange,
  onComplete,
  length = 6,
  helperText,
  error,
  disabled = false,
  labelAction,
}: OtpInputProps) {
  const generatedId = useId()
  const baseId = id || generatedId
  const inputRefs = useRef<Array<HTMLInputElement | null>>([])

  const digits = Array.from({ length }, (_, idx) => value[idx] || '')

  function focusIndex(idx: number) {
    const clamped = Math.max(0, Math.min(length - 1, idx))
    inputRefs.current[clamped]?.focus()
    inputRefs.current[clamped]?.select()
  }

  function commitDigits(nextDigits: string[]) {
    const joined = nextDigits.join('').slice(0, length)
    onChange(joined)
    if (joined.length === length && onComplete) {
      onComplete(joined)
    }
  }

  function handleChange(idx: number, raw: string) {
    const cleaned = raw.replace(/\D/g, '')
    if (!cleaned) {
      const next = [...digits]
      next[idx] = ''
      commitDigits(next)
      return
    }

    // Handle multi-digit paste or autofill into a box
    if (cleaned.length > 1) {
      const next = [...digits]
      for (let i = 0; i < cleaned.length && idx + i < length; i++) {
        next[idx + i] = cleaned[i]
      }
      commitDigits(next)
      focusIndex(Math.min(length - 1, idx + cleaned.length))
      return
    }

    const next = [...digits]
    next[idx] = cleaned[0]
    commitDigits(next)
    if (idx < length - 1) {
      focusIndex(idx + 1)
    }
  }

  function handleKeyDown(idx: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace') {
      if (digits[idx]) {
        const next = [...digits]
        next[idx] = ''
        commitDigits(next)
      } else if (idx > 0) {
        const next = [...digits]
        next[idx - 1] = ''
        commitDigits(next)
        focusIndex(idx - 1)
      }
      e.preventDefault()
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      focusIndex(idx - 1)
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      focusIndex(idx + 1)
    } else if (e.key === 'Home') {
      e.preventDefault()
      focusIndex(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      focusIndex(length - 1)
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '')
    if (!pasted) return
    e.preventDefault()
    const next = Array.from({ length }, (_, idx) => pasted[idx] || '')
    commitDigits(next)
    focusIndex(Math.min(length - 1, pasted.length))
  }

  return (
    <Field
      id={`${baseId}-0`}
      label={label}
      helperText={helperText}
      error={error}
      labelAction={labelAction}
    >
      <div
        role="group"
        aria-label={label}
        className="grid grid-cols-6 gap-2 sm:gap-2.5"
      >
        {digits.map((digit, idx) => (
          <input
            key={idx}
            ref={(el) => {
              inputRefs.current[idx] = el
            }}
            id={`${baseId}-${idx}`}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={length}
            autoComplete={idx === 0 ? 'one-time-code' : 'off'}
            disabled={disabled}
            aria-label={`Digit ${idx + 1} of ${length}`}
            aria-invalid={error ? 'true' : undefined}
            value={digit}
            onChange={(e) => handleChange(idx, e.target.value)}
            onKeyDown={(e) => handleKeyDown(idx, e)}
            onPaste={handlePaste}
            onFocus={(e) => e.currentTarget.select()}
            className={`sr-transition h-12 w-full rounded-[var(--radius-control)] border bg-[var(--bg-surface)] text-center font-mono text-lg font-semibold text-[var(--text-primary)] tabular-nums disabled:opacity-55 disabled:cursor-not-allowed ${
              error
                ? 'border-[var(--danger-solid)]'
                : 'border-[var(--border-default)] hover:border-[var(--border-strong)] focus:border-[var(--primary)]'
            }`}
          />
        ))}
      </div>
    </Field>
  )
}
