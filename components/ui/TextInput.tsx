'use client'

import { forwardRef, useId } from 'react'
import { Field } from './Field'

export interface TextInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label: string
  helperText?: string
  error?: string | null
  labelAction?: React.ReactNode
  mono?: boolean
  leftAdornment?: React.ReactNode
  rightAdornment?: React.ReactNode
  containerClassName?: string
}

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  {
    id,
    label,
    helperText,
    error,
    labelAction,
    mono = false,
    leftAdornment,
    rightAdornment,
    required,
    disabled,
    className = '',
    containerClassName = '',
    ...props
  },
  ref
) {
  const generatedId = useId()
  const inputId = id || generatedId
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
        {leftAdornment && (
          <div className="pointer-events-none absolute left-3 text-[var(--text-muted)] flex items-center">
            {leftAdornment}
          </div>
        )}
        <input
          ref={ref}
          id={inputId}
          required={required}
          disabled={disabled}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={describedBy}
          className={`sr-transition w-full h-10 rounded-[var(--radius-control)] border bg-[var(--bg-surface)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] text-sm disabled:opacity-55 disabled:cursor-not-allowed ${
            leftAdornment ? 'pl-9' : 'px-3'
          } ${rightAdornment ? 'pr-10' : 'px-3'} ${
            mono ? 'font-mono' : ''
          } ${
            error
              ? 'border-[var(--danger-solid)] focus:border-[var(--danger-solid)]'
              : 'border-[var(--border-default)] hover:border-[var(--border-strong)] focus:border-[var(--primary)]'
          } ${className}`}
          {...props}
        />
        {rightAdornment && (
          <div className="absolute right-2 flex items-center">{rightAdornment}</div>
        )}
      </div>
    </Field>
  )
})
