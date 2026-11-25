import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

const PIPELINE = [
  {
    step: '01',
    layer: 'Enumeration Guard',
    mechanism: 'Uniform HTTP 200 responses & constant-cost bcrypt timing equalization',
  },
  {
    step: '02',
    layer: 'Dual Verification',
    mechanism: '256-bit single-use token (SHA-256 hashed, 15m TTL) + 6-digit OTP',
  },
  {
    step: '03',
    layer: 'Adaptive Risk Engine',
    mechanism: 'Device fingerprint, IP & geolocation scoring → Security Question / TOTP',
  },
  {
    step: '04',
    layer: 'Abuse Controls',
    mechanism: 'MongoDB rate limits, server-signed SVG CAPTCHA & 15-minute lockouts',
  },
  {
    step: '05',
    layer: 'Password & Session Hygiene',
    mechanism: 'zxcvbn ≥ 3, HIBP k-anonymity check, 5-password history & full session revocation',
  },
]

export default function HomePage() {
  return (
    <div className="space-y-12">
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start border-b border-zinc-200 pb-12">
        <div className="lg:col-span-7 space-y-6">
          <div className="text-xs font-mono uppercase tracking-widest text-zinc-500">
            Capstone Architecture · Hardened Recovery System
          </div>
          <h1 className="font-serif text-4xl sm:text-5xl font-medium tracking-tight text-zinc-950 leading-[1.12]">
            Hardened Password Reset, Engineered Against Abuse.
          </h1>
          <p className="text-base text-zinc-600 leading-relaxed max-w-xl">
            SecureReset replaces single-link account recovery with a five-layer verification
            pipeline: anti-enumeration responses, device-bound 256-bit tokens, adaptive risk
            scoring, HIBP breach screening, and complete session invalidation.
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Link
              href="/forgot-password"
              className="inline-flex items-center gap-2 rounded-md bg-zinc-950 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 transition-colors"
            >
              Test Password Reset Flow
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/simulator"
              className="inline-flex items-center gap-2 rounded-md border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-900 hover:bg-zinc-50 transition-colors"
            >
              Launch Attack Simulator
            </Link>
            <Link
              href="/register"
              className="px-3 py-2.5 text-sm font-medium text-zinc-600 hover:text-zinc-950"
            >
              Create Account →
            </Link>
          </div>
        </div>

        <div className="lg:col-span-5 rounded-md border border-zinc-200 bg-white overflow-hidden">
          <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-2.5 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-700">
              Verification Specification
            </span>
            <span className="text-[11px] font-mono text-zinc-500">5 LAYERS</span>
          </div>
          <div className="divide-y divide-zinc-200">
            {PIPELINE.map((item) => (
              <div key={item.step} className="px-4 py-3 flex items-start gap-3">
                <span className="font-mono text-xs font-semibold text-zinc-400 pt-0.5">
                  {item.step}
                </span>
                <div className="space-y-0.5">
                  <div className="text-sm font-medium text-zinc-900">{item.layer}</div>
                  <div className="text-xs text-zinc-600 leading-relaxed">{item.mechanism}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="rounded-md border border-zinc-200 bg-white p-6 flex flex-col justify-between gap-4">
          <div className="space-y-2">
            <div className="text-xs font-mono uppercase tracking-wider text-zinc-500">01 · Recovery</div>
            <h2 className="text-base font-semibold text-zinc-950">Interactive Reset Flow</h2>
            <p className="text-sm text-zinc-600 leading-relaxed">
              Test trusted vs. foreign origin requests, inspect live risk scores, verify 6-digit
              OTPs, and satisfy TOTP or security question step-ups.
            </p>
          </div>
          <Link
            href="/forgot-password"
            className="text-xs font-semibold text-zinc-950 hover:underline inline-flex items-center gap-1"
          >
            Open Reset Flow →
          </Link>
        </div>

        <div className="rounded-md border border-zinc-200 bg-white p-6 flex flex-col justify-between gap-4">
          <div className="space-y-2">
            <div className="text-xs font-mono uppercase tracking-wider text-zinc-500">02 · Telemetry</div>
            <h2 className="text-base font-semibold text-zinc-950">Security Audit Console</h2>
            <p className="text-sm text-zinc-600 leading-relaxed">
              Monitor reset volume, blocked brute-force &amp; replay attempts, suspicious IP
              origins, chronological audit logs, and SMTP delivery records.
            </p>
          </div>
          <Link
            href="/security-dashboard"
            className="text-xs font-semibold text-zinc-950 hover:underline inline-flex items-center gap-1"
          >
            Open Security Audit →
          </Link>
        </div>

        <div className="rounded-md border border-zinc-200 bg-white p-6 flex flex-col justify-between gap-4">
          <div className="space-y-2">
            <div className="text-xs font-mono uppercase tracking-wider text-zinc-500">03 · Proof</div>
            <h2 className="text-base font-semibold text-zinc-950">Attack Simulator</h2>
            <p className="text-sm text-zinc-600 leading-relaxed">
              Run controlled enumeration probes, OTP brute-force, expired token replays, and
              cross-device hijacks compared against a naive system.
            </p>
          </div>
          <Link
            href="/simulator"
            className="text-xs font-semibold text-zinc-950 hover:underline inline-flex items-center gap-1"
          >
            Open Simulator →
          </Link>
        </div>
      </section>
    </div>
  )
}
