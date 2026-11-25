'use client'

import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  CircleDot,
  Info,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react'

export type StatusBadgeVariant = 'neutral' | 'info' | 'success' | 'warning' | 'danger'

const STATUS_CONFIG: Record<
  StatusBadgeVariant,
  { classes: string; icon: React.ReactNode }
> = {
  neutral: {
    classes:
      'bg-[var(--bg-surface-subtle)] border-[var(--border-default)] text-[var(--text-secondary)]',
    icon: <CircleDot className="h-3 w-3 shrink-0" aria-hidden="true" />,
  },
  info: {
    classes: 'bg-[var(--info-bg)] border-[var(--info-border)] text-[var(--info-text)]',
    icon: <Info className="h-3 w-3 shrink-0" aria-hidden="true" />,
  },
  success: {
    classes: 'bg-[var(--success-bg)] border-[var(--success-border)] text-[var(--success-text)]',
    icon: <CheckCircle2 className="h-3 w-3 shrink-0" aria-hidden="true" />,
  },
  warning: {
    classes: 'bg-[var(--warning-bg)] border-[var(--warning-border)] text-[var(--warning-text)]',
    icon: <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden="true" />,
  },
  danger: {
    classes: 'bg-[var(--danger-bg)] border-[var(--danger-border)] text-[var(--danger-text)]',
    icon: <AlertCircle className="h-3 w-3 shrink-0" aria-hidden="true" />,
  },
}

export interface StatusBadgeProps {
  variant?: StatusBadgeVariant
  label: string
  icon?: React.ReactNode
  mono?: boolean
  className?: string
}

/**
 * Status badge that always pairs color with an icon and explicit text label.
 */
export function StatusBadge({
  variant = 'neutral',
  label,
  icon,
  mono = false,
  className = '',
}: StatusBadgeProps) {
  const cfg = STATUS_CONFIG[variant]
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] border px-2.5 py-0.5 text-xs font-medium leading-tight whitespace-nowrap ${
        mono ? 'font-mono' : ''
      } ${cfg.classes} ${className}`}
    >
      {icon ?? cfg.icon}
      <span>{label}</span>
    </span>
  )
}

export type RiskLevel = 'low' | 'medium' | 'high'

const RISK_CONFIG: Record<
  RiskLevel,
  { label: string; classes: string; icon: React.ReactNode }
> = {
  low: {
    label: 'Low risk',
    classes: 'bg-[var(--risk-low-bg)] border-[var(--risk-low-border)] text-[var(--risk-low-text)]',
    icon: <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />,
  },
  medium: {
    label: 'Medium risk',
    classes:
      'bg-[var(--risk-medium-bg)] border-[var(--risk-medium-border)] text-[var(--risk-medium-text)]',
    icon: <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />,
  },
  high: {
    label: 'High risk',
    classes:
      'bg-[var(--risk-high-bg)] border-[var(--risk-high-border)] text-[var(--risk-high-text)]',
    icon: <ShieldAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />,
  },
}

export interface RiskBadgeProps {
  level: RiskLevel
  score?: number
  className?: string
}

/**
 * Risk scale badge (Low = green, Medium = amber, High = red), always paired with icon and text.
 */
export function RiskBadge({ level, score, className = '' }: RiskBadgeProps) {
  const cfg = RISK_CONFIG[level]
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] border px-2.5 py-0.5 text-xs font-medium leading-tight whitespace-nowrap ${cfg.classes} ${className}`}
    >
      {cfg.icon}
      <span>{cfg.label}</span>
      {typeof score === 'number' && (
        <span className="font-mono text-[11px] opacity-85">({score})</span>
      )}
    </span>
  )
}
