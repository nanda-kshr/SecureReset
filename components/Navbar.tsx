'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Shield } from 'lucide-react'
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
    { href: '/', label: 'Overview' },
    { href: '/forgot-password', label: 'Reset Flow' },
    { href: '/security-dashboard', label: 'Security Audit' },
    { href: '/simulator', label: 'Attack Simulator' },
    ...(user ? [{ href: '/dashboard', label: 'Account' }] : []),
  ]

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white/95 backdrop-blur-sm">
      <div className="max-w-6xl mx-auto px-4 sm:px-8 h-14 flex items-center justify-between gap-6">
        <div className="flex items-center gap-8 h-full">
          <Link
            href="/"
            className="flex items-center gap-2 font-semibold tracking-tight text-zinc-950"
          >
            <Shield className="h-4 w-4 text-zinc-900" strokeWidth={2} />
            <span className="text-[15px]">SecureReset</span>
          </Link>

          <nav className="hidden md:flex items-center gap-6 h-full">
            {navItems.map((item) => {
              const isActive = pathname === item.href
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`h-full inline-flex items-center text-sm border-b-2 transition-colors ${
                    isActive
                      ? 'border-zinc-950 text-zinc-950 font-medium'
                      : 'border-transparent text-zinc-500 hover:text-zinc-900'
                  }`}
                >
                  {item.label}
                </Link>
              )
            })}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          {user ? (
            <>
              <Link
                href="/dashboard"
                className="hidden sm:inline-flex items-center gap-2 text-xs text-zinc-700 hover:text-zinc-950"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                <span className="font-medium">{user.name}</span>
              </Link>
              <button
                onClick={handleLogout}
                type="button"
                className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 hover:text-zinc-950 cursor-pointer"
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="px-2.5 py-1.5 text-sm text-zinc-600 hover:text-zinc-950"
              >
                Sign in
              </Link>
              <Link
                href="/register"
                className="rounded-md bg-zinc-950 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 transition-colors"
              >
                Register
              </Link>
            </>
          )}
        </div>
      </div>

      <div className="md:hidden border-t border-zinc-200 bg-zinc-50 px-4 py-2 flex gap-4 overflow-x-auto">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`whitespace-nowrap text-xs ${
              pathname === item.href ? 'font-semibold text-zinc-950' : 'text-zinc-500'
            }`}
          >
            {item.label}
          </Link>
        ))}
      </div>
    </header>
  )
}
