'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { ShieldCheck, Activity, Terminal, KeyRound, LayoutDashboard, LogOut } from 'lucide-react'
import { secureFetch } from '@/lib/client/api'

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
    { href: '/', label: 'Overview', icon: ShieldCheck },
    { href: '/forgot-password', label: 'Reset Flow', icon: KeyRound },
    { href: '/security-dashboard', label: 'Security SOC', icon: Activity },
    { href: '/simulator', label: 'Attack Simulator', icon: Terminal },
    ...(user ? [{ href: '/dashboard', label: 'Account', icon: LayoutDashboard }] : []),
  ]

  return (
    <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-slate-950/90 backdrop-blur">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2.5 font-semibold tracking-tight text-white">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/15 border border-emerald-500/40 text-emerald-400">
            <ShieldCheck className="h-4 w-4" />
          </span>
          <span>SecureReset</span>
        </Link>

        <nav className="hidden md:flex items-center gap-1">
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-900'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="flex items-center gap-2">
          {user ? (
            <>
              <Link
                href="/dashboard"
                className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-slate-900 border border-slate-700 px-3 py-1 text-xs text-slate-200 hover:border-emerald-500/50"
              >
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                {user.name}
              </Link>
              <button
                onClick={handleLogout}
                type="button"
                className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs text-slate-300 hover:bg-slate-900 hover:text-white cursor-pointer"
              >
                <LogOut className="h-3.5 w-3.5" />
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="px-3 py-1.5 rounded-lg text-sm text-slate-300 hover:text-white hover:bg-slate-900"
              >
                Sign in
              </Link>
              <Link
                href="/register"
                className="px-3 py-1.5 rounded-lg text-sm font-medium bg-emerald-500 text-slate-950 hover:bg-emerald-400 transition-colors"
              >
                Register
              </Link>
            </>
          )}
        </div>
      </div>

      <div className="md:hidden border-t border-slate-800/80 px-4 py-2 flex gap-2 overflow-x-auto">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`whitespace-nowrap px-2.5 py-1 rounded-md text-xs ${
              pathname === item.href
                ? 'bg-emerald-500/15 text-emerald-300'
                : 'text-slate-400 hover:text-slate-100'
            }`}
          >
            {item.label}
          </Link>
        ))}
      </div>
    </header>
  )
}
