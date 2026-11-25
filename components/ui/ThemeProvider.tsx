'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from 'react'
import { Monitor, Moon, Sun } from 'lucide-react'

export type ThemePreference = 'system' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'

interface ThemeContextValue {
  theme: ThemePreference
  resolvedTheme: ResolvedTheme
  setTheme: (next: ThemePreference) => void
  toggleTheme: () => void
}

const STORAGE_KEY = 'sr_theme'
const ThemeContext = createContext<ThemeContextValue | null>(null)
const listeners = new Set<() => void>()

function emitChange() {
  listeners.forEach((cb) => cb())
}

function subscribe(callback: () => void) {
  listeners.add(callback)
  if (typeof window === 'undefined') {
    return () => {
      listeners.delete(callback)
    }
  }
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  const handleMedia = () => emitChange()
  const handleStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) emitChange()
  }
  mq.addEventListener('change', handleMedia)
  window.addEventListener('storage', handleStorage)
  return () => {
    listeners.delete(callback)
    mq.removeEventListener('change', handleMedia)
    window.removeEventListener('storage', handleStorage)
  }
}

function readStoredTheme(): ThemePreference {
  if (typeof window === 'undefined') return 'system'
  try {
    const val = window.localStorage.getItem(STORAGE_KEY)
    if (val === 'light' || val === 'dark' || val === 'system') return val
  } catch {
    // Ignore storage restriction
  }
  return 'system'
}

function getSystemResolved(): ResolvedTheme {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyThemeToDom(pref: ThemePreference) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  if (pref === 'system') {
    root.removeAttribute('data-theme')
  } else {
    root.setAttribute('data-theme', pref)
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSyncExternalStore<ThemePreference>(
    subscribe,
    readStoredTheme,
    () => 'system'
  )

  const resolvedTheme = useSyncExternalStore<ResolvedTheme>(
    subscribe,
    () => (theme === 'system' ? getSystemResolved() : theme),
    () => 'light'
  )

  useEffect(() => {
    applyThemeToDom(theme)
  }, [theme])

  const setTheme = useCallback((next: ThemePreference) => {
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(STORAGE_KEY, next)
      } catch {
        // Ignore storage error
      }
    }
    applyThemeToDom(next)
    emitChange()
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')
  }, [resolvedTheme, setTheme])

  const value = useMemo(
    () => ({ theme, resolvedTheme, setTheme, toggleTheme }),
    [theme, resolvedTheme, setTheme, toggleTheme]
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) {
    return {
      theme: 'system',
      resolvedTheme: 'light',
      setTheme: () => {},
      toggleTheme: () => {},
    }
  }
  return ctx
}

/**
 * Compact header toggle between Light and Dark themes.
 */
export function ThemeToggle({ className = '' }: { className?: string }) {
  const { resolvedTheme, toggleTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      className={`sr-transition inline-flex items-center justify-center gap-1.5 h-8 px-2.5 rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-subtle)] hover:text-[var(--text-primary)] text-xs font-medium cursor-pointer ${className}`}
    >
      {isDark ? <Sun className="h-3.5 w-3.5" aria-hidden="true" /> : <Moon className="h-3.5 w-3.5" aria-hidden="true" />}
      <span className="hidden sm:inline">{isDark ? 'Light' : 'Dark'}</span>
    </button>
  )
}

/**
 * Explicit 3-way selector (System / Light / Dark) for settings and styleguide.
 */
export function ThemeModeSelector() {
  const { theme, setTheme } = useTheme()
  const options: Array<{ id: ThemePreference; label: string; icon: React.ReactNode }> = [
    { id: 'system', label: 'System', icon: <Monitor className="h-3.5 w-3.5" aria-hidden="true" /> },
    { id: 'light', label: 'Light', icon: <Sun className="h-3.5 w-3.5" aria-hidden="true" /> },
    { id: 'dark', label: 'Dark', icon: <Moon className="h-3.5 w-3.5" aria-hidden="true" /> },
  ]

  return (
    <div
      role="group"
      aria-label="Color theme preference"
      className="inline-flex rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--bg-surface-subtle)] p-1 gap-1"
    >
      {options.map((opt) => {
        const active = theme === opt.id
        return (
          <button
            key={opt.id}
            type="button"
            aria-pressed={active}
            onClick={() => setTheme(opt.id)}
            className={`sr-transition inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] text-xs font-medium cursor-pointer ${
              active
                ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-[var(--shadow-xs)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            {opt.icon}
            <span>{opt.label}</span>
          </button>
        )
      })}
    </div>
  )
}
