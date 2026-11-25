'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Clock } from 'lucide-react'

export interface CountdownTimerProps {
  /** Target completion timestamp (Date, ISO string, or ms epoch) */
  targetTime?: Date | string | number
  /** Or static initial seconds remaining (used when targetTime is omitted) */
  secondsRemaining?: number
  /** Total duration in seconds for calculating circular/linear progress */
  totalSeconds?: number
  variant?: 'inline' | 'linear' | 'circular'
  label?: string
  showCompletionTime?: boolean
  onComplete?: () => void
  className?: string
}

function formatDuration(totalSec: number): { display: string; verbose: string } {
  const clamped = Math.max(0, Math.floor(totalSec))
  const days = Math.floor(clamped / 86400)
  const hours = Math.floor((clamped % 86400) / 3600)
  const minutes = Math.floor((clamped % 3600) / 60)
  const seconds = clamped % 60

  const pad = (n: number) => String(n).padStart(2, '0')

  if (days > 0) {
    return {
      display: `${days}d ${pad(hours)}h ${pad(minutes)}m`,
      verbose: `${days} days, ${hours} hours, ${minutes} minutes`,
    }
  }
  if (hours > 0) {
    return {
      display: `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`,
      verbose: `${hours} hours, ${minutes} minutes, ${seconds} seconds`,
    }
  }
  return {
    display: `${pad(minutes)}:${pad(seconds)}`,
    verbose: `${minutes} minutes, ${seconds} seconds`,
  }
}

export function CountdownTimer({
  targetTime,
  secondsRemaining,
  totalSeconds,
  variant = 'inline',
  label,
  showCompletionTime = false,
  onComplete,
  className = '',
}: CountdownTimerProps) {
  const targetMs = useMemo(() => {
    if (targetTime !== undefined) {
      return typeof targetTime === 'number' ? targetTime : new Date(targetTime).getTime()
    }
    return null
  }, [targetTime])

  const [nowMs, setNowMs] = useState<number>(() => Date.now())
  const [elapsedSec, setElapsedSec] = useState<number>(0)
  const completedRef = useRef(false)

  useEffect(() => {
    completedRef.current = false
    const interval = setInterval(() => {
      setNowMs(Date.now())
      setElapsedSec((prev) => prev + 1)
    }, 1000)

    return () => clearInterval(interval)
  }, [targetMs, secondsRemaining])

  const remaining = useMemo(() => {
    if (targetMs !== null) {
      return Math.max(0, Math.ceil((targetMs - nowMs) / 1000))
    }
    if (typeof secondsRemaining === 'number') {
      return Math.max(0, secondsRemaining - elapsedSec)
    }
    return 0
  }, [targetMs, nowMs, secondsRemaining, elapsedSec])

  useEffect(() => {
    if (remaining === 0 && !completedRef.current && (targetMs !== null || (secondsRemaining ?? 0) > 0)) {
      completedRef.current = true
      onComplete?.()
    }
  }, [remaining, targetMs, secondsRemaining, onComplete])

  const { display, verbose } = formatDuration(remaining)
  const effectiveTotal = totalSeconds && totalSeconds > 0 ? totalSeconds : Math.max(remaining, 1)
  const elapsedRatio = Math.min(1, Math.max(0, (effectiveTotal - remaining) / effectiveTotal))
  const percentComplete = Math.round(elapsedRatio * 100)

  const completionFormatted = useMemo(() => {
    if (!showCompletionTime) return null
    const end = targetMs !== null ? new Date(targetMs) : new Date(nowMs + remaining * 1000)
    try {
      return new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(end)
    } catch {
      return end.toLocaleString()
    }
  }, [showCompletionTime, targetMs, nowMs, remaining])

  if (variant === 'inline') {
    return (
      <span
        className={`inline-flex items-center gap-1.5 font-mono text-xs tabular-nums text-[var(--text-secondary)] ${className}`}
        aria-label={label ? `${label}: ${verbose}` : verbose}
      >
        <Clock className="h-3.5 w-3.5 text-[var(--text-muted)] shrink-0" aria-hidden="true" />
        {label && <span className="font-sans text-[var(--text-muted)]">{label}</span>}
        <span className="font-semibold text-[var(--text-primary)]">{display}</span>
      </span>
    )
  }

  if (variant === 'circular') {
    const size = 148
    const stroke = 8
    const radius = (size - stroke) / 2
    const circumference = 2 * Math.PI * radius
    const dashOffset = circumference * (1 - elapsedRatio)

    return (
      <div className={`flex flex-col items-center text-center gap-3 ${className}`}>
        <div className="relative inline-flex items-center justify-center">
          <svg
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            role="img"
            aria-label={label ? `${label}: ${verbose} remaining` : `${verbose} remaining`}
            className="-rotate-90"
          >
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="var(--border-subtle)"
              strokeWidth={stroke}
            />
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="var(--primary)"
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              className="sr-transition-slow"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center px-3">
            {label && (
              <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
                {label}
              </span>
            )}
            <span className="font-mono text-xl font-semibold tabular-nums text-[var(--text-primary)]">
              {display}
            </span>
          </div>
        </div>
        {completionFormatted && (
          <p className="text-xs text-[var(--text-muted)]">
            Completes <span className="font-medium text-[var(--text-secondary)]">{completionFormatted}</span>
          </p>
        )}
      </div>
    )
  }

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="font-medium text-[var(--text-secondary)]">
          {label || 'Time remaining'}
        </span>
        <span className="font-mono font-semibold tabular-nums text-[var(--text-primary)]">
          {display}
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percentComplete}
        aria-label={label || 'Countdown progress'}
        className="h-2 w-full rounded-full bg-[var(--bg-surface-muted)] overflow-hidden"
      >
        <div
          className="h-full rounded-full bg-[var(--primary)] sr-transition-slow"
          style={{ width: `${percentComplete}%` }}
        />
      </div>
      {completionFormatted && (
        <p className="text-xs text-[var(--text-muted)]">
          Completes at <span className="font-medium text-[var(--text-secondary)]">{completionFormatted}</span>
        </p>
      )}
    </div>
  )
}
