'use client'

import { AlertCircle } from 'lucide-react'

export interface FieldProps {
  id: string
  label: string
  required?: boolean
  helperText?: string
  error?: string | null
  labelAction?: React.ReactNode
  children: React.ReactNode
  className?: string
}

export function Field({
  id,
  label,
  required,
  helperText,
  error,
  labelAction,
  children,
  className = '',
}: FieldProps) {
  const helperId = helperText ? `${id}-helper` : undefined
  const errorId = error ? `${id}-error` : undefined

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-baseline justify-between gap-2">
        <label
          htmlFor={id}
          className="block text-sm font-medium text-[var(--text-primary)] leading-snug"
        >
          {label}
          {required && (
            <span className="text-[var(--danger-text)] ml-1" aria-hidden="true">
              *
            </span>
          )}
        </label>
        {labelAction && <div className="text-xs shrink-0">{labelAction}</div>}
      </div>

      {children}

      {helperText && !error && (
        <p id={helperId} className="text-xs text-[var(--text-muted)] leading-normal">
          {helperText}
        </p>
      )}

      {error && (
        <p
          id={errorId}
          role="alert"
          aria-live="polite"
          className="flex items-start gap-1.5 text-xs font-medium text-[var(--danger-text)] leading-normal"
        >
          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden="true" />
          <span>{error}</span>
        </p>
      )}
    </div>
  )
}
