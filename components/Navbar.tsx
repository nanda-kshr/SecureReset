'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { secureFetch } from '@/lib/client/api'
import { ThemeToggle } from '@/components/ui'

interface NavUser {
  id: string
  name: string
  email: string
  role: string
}

export function Navbar() {
  const pathname = usePathname()
  const router = useRouter()
  const [user, setUser] = useState<NavUser | null>(null)

  useEffect(() => {
    let active = true
    fetch('/api/auth/me', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : { user: null }))
      .then((data) => {
        if (active) setUser(data.user || null)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [pathname])

  async function handleLogout() {
    await secureFetch('/api/auth/logout', { method: 'POST' })
    setUser(null)
    router.push('/login')
    router.refresh()
  }

  const navItems = [
    { href: '/', label: 'Overview' },
    { href: '/forgot-password', label: 'Reset Flow' },
    { href: '/security-dashboard', label: 'Security Audit' },
    { href: '/simulator', label: 'Attack Simulator' },
    { href: '/styleguide', label: 'Styleguide' },
    ...(user ? [{ href: '/dashboard', label: 'Account' }] : []),
  ]

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]/95 backdrop-blur-sm">
      <div className="max-w-6xl mx-auto px-4 sm:px-8 h-14 flex items-center justify-between gap-4">
        <div className="flex items-center gap-6 sm:gap-8 h-full min-w-0">
          <Link
            href="/"
            className="flex items-center gap-2 font-semibold tracking-tight text-[var(--text-primary)] shrink-0"
          >
            <ShieldCheck className="h-4 w-4 text-[var(--primary)]" strokeWidth={2.2} aria-hidden="true" />
            <span className="text-[15px]">SecureReset</span>
          </Link>

          <nav aria-label="Primary navigation" className="hidden md:flex items-center gap-5 h-full">
            {navItems.map((item) => {
              const isActive = pathname === item.href
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive ? 'page' : undefined}
                  className={`sr-transition h-full inline-flex items-center text-sm border-b-2 whitespace-nowrap ${
                    isActive
                      ? 'border-[var(--primary)] text-[var(--text-primary)] font-medium'
                      : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {item.label}
                </Link>
              )
            })}
          </nav>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <ThemeToggle />

          {user ? (
            <>
              <Link
                href="/dashboard"
                className="hidden sm:inline-flex items-center gap-2 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                <span className="h-2 w-2 rounded-full bg-[var(--success-solid)]" aria-hidden="true" />
                <span className="font-medium">{user.name}</span>
              </Link>
              <button
                onClick={handleLogout}
                type="button"
                className="sr-transition rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-surface-subtle)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="sr-transition px-2.5 py-1.5 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-[var(--radius-control)]"
              >
                Sign in
              </Link>
              <Link
                href="/register"
                className="sr-transition rounded-[var(--radius-control)] bg-[var(--primary)] px-3.5 py-1.5 text-sm font-medium text-[var(--primary-fg)] hover:bg-[var(--primary-hover)]"
              >
                Register
              </Link>
            </>
          )}
        </div>
      </div>

      <nav
        aria-label="Mobile navigation"
        className="md:hidden border-t border-[var(--border-subtle)] bg-[var(--bg-surface-subtle)] px-4 py-2 flex gap-4 overflow-x-auto"
      >
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={pathname === item.href ? 'page' : undefined}
            className={`whitespace-nowrap text-xs py-0.5 ${
              pathname === item.href
                ? 'font-semibold text-[var(--text-primary)]'
                : 'text-[var(--text-muted)]'
            }`}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
  )
}
