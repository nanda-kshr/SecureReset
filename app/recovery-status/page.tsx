'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'

function RecoveryStatusContent() {
  const searchParams = useSearchParams()
  const handle = searchParams.get('h') || ''

  const [status, setStatus] = useState<{
    valid: boolean
    state?: string
    completesAt?: string
    coolingOffHours?: number
    statusText: string
  } | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/auth/reset-status?h=${encodeURIComponent(handle)}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setStatus(d)
      })
      .catch(() => {
        if (!cancelled) {
          setStatus({
            valid: false,
            statusText:
              'If your verification was accepted, your reset is scheduled to complete at the displayed time unless cancelled by the account owner.',
          })
        }
      })
    return () => {
      cancelled = true
    }
  }, [handle])

  return (
    <div className="max-w-md mx-auto">
      <div className="rounded-md border border-zinc-200 bg-white p-7 space-y-5">
        <div className="border-b border-zinc-100 pb-4 space-y-1">
          <div className="text-[11px] font-mono uppercase tracking-wider text-zinc-500">
            Recovery Cooling-Off Status
          </div>
          <h1 className="font-serif text-2xl font-medium text-zinc-950">Pending Reset Status</h1>
        </div>

        {!status ? (
          <p className="text-xs text-zinc-500">Checking recovery schedule...</p>
        ) : (
          <div className="space-y-4 text-xs text-zinc-700">
            <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4 space-y-2">
              <div className="text-sm font-medium text-zinc-950">{status.statusText}</div>
              {status.valid && typeof status.coolingOffHours === 'number' && (
                <div className="font-mono text-zinc-500">
                  State: {status.state} · Delay: {status.coolingOffHours}h
                </div>
              )}
            </div>
            <p className="text-zinc-500 leading-relaxed">
              During the cooling-off period, all confirmed channels receive a one-tap veto link and
              signing in with existing credentials cancels the reset.
            </p>
            <Link href="/login" className="inline-block font-medium text-zinc-950 hover:underline">
              Return to Sign In →
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}

export default function RecoveryStatusPage() {
  return (
    <Suspense fallback={<div className="py-12 text-center text-xs text-zinc-500">Loading...</div>}>
      <RecoveryStatusContent />
    </Suspense>
  )
}
