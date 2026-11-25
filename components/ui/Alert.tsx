'use client'

import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'

export type AlertVariant = 'info' | 'warning' | 'danger' | 'success'

export interface AlertProps {
  variant?: AlertVariant
  title?: string
  children: React.ReactNode
  actions?: React.ReactNode
  onDismiss?: () => void
  className?: string
}

const VARIANT_CONFIG: Record<
  AlertVariant,
  { container: string; icon: React.ReactNode; role: 'status' | 'alert'; live: 'polite' | 'assertive' }
> = {
  info: {
    container: 'bg-[var(--info-bg)] border-[var(--info-border)] text-[var(--info-text)]',
    icon: <Info className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />,
    role: 'status',
    live: 'polite',
  },
  success: {
    container: 'bg-[var(--success-bg)] border-[var(--success-border)] text-[var(--success-text)]',
    icon: <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />,
    role: 'status',
    live: 'polite',
  },
  warning: {
    container: 'bg-[var(--warning-bg)] border-[var(--warning-border)] text-[var(--warning-text)]',
    icon: <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />,
    role: 'alert',
    live: 'polite',
  },
  danger: {
    container: 'bg-[var(--danger-bg)] border-[var(--danger-border)] text-[var(--danger-text)]',
    icon: <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />,
    role: 'alert',
    live: 'assertive',
  },
}

export function Alert({
  variant = 'info',
  title,
  children,
  actions,
  onDismiss,
  className = '',
}: AlertProps) {
  const cfg = VARIANT_CONFIG[variant]

  return (
    <div
      role={cfg.role}
      aria-live={cfg.live}
      className={`rounded-[var(--radius-card)] border p-4 text-sm leading-normal ${cfg.container} ${className}`}
    >
      <div className="flex items-start gap-3">
        {cfg.icon}
        <div className="flex-1 min-w-0 space-y-1">
          {title && <div className="font-semibold leading-snug">{title}</div>}
          <div className="text-sm leading-normal">{children}</div>
          {actions && <div className="pt-2 flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss notification"
            className="sr-transition inline-flex items-center justify-center h-6 w-6 rounded-[6px] opacity-80 hover:opacity-100 cursor-pointer shrink-0"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  )
}
