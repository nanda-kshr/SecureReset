'use client'

import { useSyncExternalStore } from 'react'
import {
  DEMO_ORIGIN_PROFILES,
  DemoOriginProfile,
  getSavedDemoOrigin,
  setSavedDemoOrigin,
} from '@/lib/client/api'

const listeners = new Set<() => void>()

function subscribe(callback: () => void) {
  listeners.add(callback)
  return () => {
    listeners.delete(callback)
  }
}

export function DemoContextSwitcher() {
  const selected = useSyncExternalStore<DemoOriginProfile['id']>(
    subscribe,
    () => getSavedDemoOrigin().id,
    () => 'trusted'
  )

  function handleChange(id: DemoOriginProfile['id']) {
    setSavedDemoOrigin(id)
    listeners.forEach((cb) => cb())
  }

  return (
    <div className="rounded-md border border-zinc-200 bg-white px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div className="text-xs text-zinc-600">
        <span className="font-semibold text-zinc-900">Origin Context:</span>{' '}
        Switch simulated IP &amp; device to evaluate risk scoring.
      </div>
      <select
        aria-label="Simulated request origin"
        value={selected}
        onChange={(e) => handleChange(e.target.value as DemoOriginProfile['id'])}
        className="rounded-md border border-zinc-300 bg-zinc-50 px-2.5 py-1.5 text-xs text-zinc-900 focus:border-zinc-900 focus:outline-none"
      >
        {DEMO_ORIGIN_PROFILES.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </select>
    </div>
  )
}
