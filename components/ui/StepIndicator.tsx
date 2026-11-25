'use client'

import { Check } from 'lucide-react'

export interface StepItem {
  id: string
  label: string
  description?: string
}

export interface StepIndicatorProps {
  steps: StepItem[]
  currentStep: number | string
  orientation?: 'horizontal' | 'vertical'
  className?: string
}

export function StepIndicator({
  steps,
  currentStep,
  orientation = 'horizontal',
  className = '',
}: StepIndicatorProps) {
  const activeIdx =
    typeof currentStep === 'number'
      ? currentStep
      : Math.max(
          0,
          steps.findIndex((s) => s.id === currentStep)
        )

  if (orientation === 'vertical') {
    return (
      <nav aria-label="Progress" className={className}>
        <ol className="space-y-4">
          {steps.map((step, idx) => {
            const isComplete = idx < activeIdx
            const isCurrent = idx === activeIdx
            return (
              <li
                key={step.id}
                aria-current={isCurrent ? 'step' : undefined}
                className="relative flex items-start gap-3"
              >
                {idx < steps.length - 1 && (
                  <span
                    aria-hidden="true"
                    className={`absolute left-3.5 top-7 h-[calc(100%-8px)] w-px ${
                      isComplete ? 'bg-[var(--primary)]' : 'bg-[var(--border-default)]'
                    }`}
                  />
                )}
                <span
                  className={`relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${
                    isComplete
                      ? 'border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-fg)]'
                      : isCurrent
                        ? 'border-[var(--primary)] bg-[var(--primary-subtle)] text-[var(--primary-text)]'
                        : 'border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-muted)]'
                  }`}
                >
                  {isComplete ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : idx + 1}
                </span>
                <div className="pt-0.5 min-w-0">
                  <div
                    className={`text-sm font-medium leading-snug ${
                      isCurrent || isComplete
                        ? 'text-[var(--text-primary)]'
                        : 'text-[var(--text-muted)]'
                    }`}
                  >
                    {step.label}
                  </div>
                  {step.description && (
                    <p className="text-xs text-[var(--text-muted)] mt-0.5 leading-normal">
                      {step.description}
                    </p>
                  )}
                </div>
              </li>
            )
          })}
        </ol>
      </nav>
    )
  }

  return (
    <nav aria-label="Progress" className={className}>
      <ol className="flex items-center justify-between gap-2">
        {steps.map((step, idx) => {
          const isComplete = idx < activeIdx
          const isCurrent = idx === activeIdx
          return (
            <li
              key={step.id}
              aria-current={isCurrent ? 'step' : undefined}
              className="flex-1 flex items-center gap-2 min-w-0"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${
                    isComplete
                      ? 'border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-fg)]'
                      : isCurrent
                        ? 'border-[var(--primary)] bg-[var(--primary-subtle)] text-[var(--primary-text)]'
                        : 'border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-muted)]'
                  }`}
                >
                  {isComplete ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : idx + 1}
                </span>
                <span
                  className={`text-xs truncate ${
                    isCurrent
                      ? 'font-semibold text-[var(--text-primary)]'
                      : isComplete
                        ? 'font-medium text-[var(--text-secondary)]'
                        : 'text-[var(--text-muted)]'
                  }`}
                >
                  {step.label}
                </span>
              </div>
              {idx < steps.length - 1 && (
                <span
                  aria-hidden="true"
                  className={`hidden sm:block flex-1 h-px ${
                    isComplete ? 'bg-[var(--primary)]' : 'bg-[var(--border-default)]'
                  }`}
                />
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
