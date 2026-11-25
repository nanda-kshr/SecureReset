'use client'

import { useId, useState } from 'react'
import { ChevronDown, HelpCircle } from 'lucide-react'

export interface ExpandableExplainerProps {
  title: string
  children: React.ReactNode
  defaultOpen?: boolean
  className?: string
}

export function ExpandableExplainer({
  title,
  children,
  defaultOpen = false,
  className = '',
}: ExpandableExplainerProps) {
  const [open, setOpen] = useState(defaultOpen)
  const panelId = useId()

  return (
    <div
      className={`rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--bg-surface-subtle)] ${className}`}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="sr-transition w-full flex items-center justify-between gap-3 px-4 py-3 text-left text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--bg-surface-muted)]/50 rounded-[var(--radius-control)] cursor-pointer"
      >
        <span className="inline-flex items-center gap-2">
          <HelpCircle className="h-4 w-4 text-[var(--text-muted)] shrink-0" aria-hidden="true" />
          <span>{title}</span>
        </span>
        <ChevronDown
          className={`h-4 w-4 text-[var(--text-muted)] shrink-0 sr-transition ${
            open ? 'rotate-180' : ''
          }`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          id={panelId}
          className="px-4 pb-3.5 pt-1 text-sm text-[var(--text-secondary)] leading-normal border-t border-[var(--border-subtle)]"
        >
          {children}
        </div>
      )}
    </div>
  )
}
