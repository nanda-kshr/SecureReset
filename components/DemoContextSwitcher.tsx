'use client'

import { useSyncExternalStore } from 'react'
import { Globe } from 'lucide-react'
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
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-xs text-slate-300">
        <Globe className="h-4 w-4 text-cyan-400 shrink-0" />
        <span>
          <strong className="text-slate-100">Demo Origin Simulator:</strong> Switch simulated IP/device to test Risk Scoring &amp; Device Binding
        </span>
      </div>
      <select
        aria-label="Simulated request origin"
        value={selected}
        onChange={(e) => handleChange(e.target.value as DemoOriginProfile['id'])}
        className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 focus:border-cyan-500 focus:outline-none"
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
