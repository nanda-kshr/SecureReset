'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'
import { secureFetch } from '@/lib/client/api'

function VetoContent() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token') || ''

  const [loading, setLoading] = useState(true)
  const [info, setInfo] = useState<{
    valid: boolean
    originLocation?: string
    originIp?: string
    completesAt?: string | null
    message?: string
  } | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [resultMsg, setResultMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    if (!token) {
      Promise.resolve().then(() => {
        if (!cancelled) {
          setInfo({ valid: false, message: 'Missing veto token.' })
          setLoading(false)
        }
      })
      return () => {
        cancelled = true
      }
    }
    fetch(`/api/auth/veto?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setInfo(d)
      })
      .catch(() => {
        if (!cancelled) setInfo({ valid: false, message: 'Unable to validate veto link.' })
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [token])

  async function confirmVeto() {
    setSubmitting(true)
    setError(null)
    try {
      const res = await secureFetch('/api/auth/veto', {
        method: 'POST',
        body: JSON.stringify({ vetoToken: token }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Veto failed.')
        return
      }
      setResultMsg(data.message)
    } catch {
      setError('Network error executing veto.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-md mx-auto">
      <div className="rounded-md border border-zinc-200 bg-white p-7 space-y-5">
        <div className="border-b border-zinc-100 pb-4 space-y-1">
          <div className="text-[11px] font-mono uppercase tracking-wider text-rose-700">
            Emergency Recovery Veto
          </div>
          <h1 className="font-serif text-2xl font-medium text-zinc-950">
            Cancel Pending Password Reset
          </h1>
        </div>

        {loading && <p className="text-xs text-zinc-500">Verifying single-use veto link...</p>}

        {error && (
          <div role="alert" className="rounded-md border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
            {error}
          </div>
        )}

        {resultMsg ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 space-y-3 text-xs text-emerald-950">
            <p className="font-medium">{resultMsg}</p>
            <Link
              href="/login"
              className="inline-block rounded-md bg-zinc-950 px-4 py-2 font-medium text-white"
            >
              Sign In to Review Sessions &amp; Settings →
            </Link>
          </div>
        ) : (
          !loading &&
          info &&
          (info.valid ? (
            <div className="space-y-4 text-xs text-zinc-700">
              <p className="leading-relaxed">
                A password reset request originated from{' '}
                <strong className="text-zinc-950">{info.originLocation}</strong> (
                <span className="font-mono">{info.originIp}</span>). Confirm below to immediately
                cancel the reset, invalidate all reset tokens, and flag the account.
              </p>
              <button
                type="button"
                disabled={submitting}
                onClick={confirmVeto}
                className="w-full rounded-md bg-rose-700 py-2.5 text-sm font-medium text-white hover:bg-rose-800 disabled:opacity-50 cursor-pointer"
              >
                {submitting ? 'Cancelling Reset...' : "This Wasn't Me — Cancel Reset"}
              </button>
            </div>
          ) : (
            <p className="text-xs text-zinc-600">
              {info.message || 'This veto link is invalid, expired, or has already been used.'}
            </p>
          ))
        )}
      </div>
    </div>
  )
}

export default function VetoPage() {
  return (
    <Suspense fallback={<div className="py-12 text-center text-xs text-zinc-500">Loading...</div>}>
      <VetoContent />
    </Suspense>
  )
}
