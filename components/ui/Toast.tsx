'use client'

import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'

export type ToastVariant = 'info' | 'success' | 'warning' | 'danger'

export interface ToastInput {
  title: string
  description?: string
  variant?: ToastVariant
  durationMs?: number
}

interface ToastItem extends Required<Pick<ToastInput, 'title' | 'variant'>> {
  id: string
  description?: string
}

interface ToastContextValue {
  toast: (input: ToastInput) => string
  dismiss: (id: string) => void
  dismissAll: () => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const VARIANT_ICON: Record<ToastVariant, React.ReactNode> = {
  info: <Info className="h-4 w-4 text-[var(--info-text)] shrink-0 mt-0.5" aria-hidden="true" />,
  success: (
    <CheckCircle2 className="h-4 w-4 text-[var(--success-text)] shrink-0 mt-0.5" aria-hidden="true" />
  ),
  warning: (
    <AlertTriangle className="h-4 w-4 text-[var(--warning-text)] shrink-0 mt-0.5" aria-hidden="true" />
  ),
  danger: (
    <AlertCircle className="h-4 w-4 text-[var(--danger-text)] shrink-0 mt-0.5" aria-hidden="true" />
  ),
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const dismissAll = useCallback(() => {
    setToasts([])
  }, [])

  const toast = useCallback(
    ({ title, description, variant = 'info', durationMs = 4500 }: ToastInput) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      setToasts((prev) => [...prev.slice(-3), { id, title, description, variant }])
      if (durationMs > 0) {
        setTimeout(() => {
          dismiss(id)
        }, durationMs)
      }
      return id
    },
    [dismiss]
  )

  const value = useMemo(() => ({ toast, dismiss, dismissAll }), [toast, dismiss, dismissAll])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-label="Notifications"
        className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-[calc(100vw-2rem)] max-w-sm pointer-events-none"
      >
        {toasts.map((item) => (
          <div
            key={item.id}
            role="status"
            className="pointer-events-auto rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-primary)] p-3.5 shadow-[var(--shadow-md)] flex items-start gap-3"
          >
            {VARIANT_ICON[item.variant]}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium leading-snug">{item.title}</div>
              {item.description && (
                <p className="text-xs text-[var(--text-muted)] mt-0.5 leading-normal">
                  {item.description}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => dismiss(item.id)}
              aria-label="Close notification"
              className="sr-transition inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[6px] text-[var(--text-muted)] hover:bg-[var(--bg-surface-subtle)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    return {
      toast: () => '',
      dismiss: () => {},
      dismissAll: () => {},
    }
  }
  return ctx
}
