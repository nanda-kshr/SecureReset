import Link from 'next/link'
import {
  ShieldCheck,
  KeyRound,
  Activity,
  Terminal,
  Lock,
  Fingerprint,
  MailCheck,
  DatabaseZap,
} from 'lucide-react'

const LAYERS = [
  {
    icon: MailCheck,
    title: '1. Anti-Enumeration & Dual Factor',
    desc: 'Uniform HTTP 200 responses prevent email probing. Resets require both a 256-bit hashed single-use link (15m TTL) and a 6-digit OTP.',
  },
  {
    icon: Fingerprint,
    title: '2. Device Binding & Risk Scoring',
    desc: 'Tokens are cryptographically bound to the requesting device fingerprint. Unusual IP, device, or location triggers Security Question or TOTP.',
  },
  {
    icon: Lock,
    title: '3. Rate Limits, Lockouts & CAPTCHA',
    desc: 'MongoDB-backed rate limiting throttles requests. Repeated OTP failures trigger server-signed SVG CAPTCHA and 15-minute lockouts.',
  },
  {
    icon: DatabaseZap,
    title: '4. zxcvbn + HIBP + Reuse Blocking',
    desc: 'New passwords require zxcvbn score >= 3, pass Have I Been Pwned k-anonymity checks, and cannot reuse the last 5 passwords.',
  },
]

export default function HomePage() {
  return (
    <div className="space-y-12">
      <section className="rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-950 to-emerald-950/30 p-8 sm:p-10">
        <div className="max-w-3xl space-y-5">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300">
            <ShieldCheck className="h-3.5 w-3.5" />
            Capstone Security Architecture · Next.js 16 + MongoDB + Nodemailer
          </div>
          <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-white">
            Hardened Password Reset, Built to Defeat Real Attacks.
          </h1>
          <p className="text-base sm:text-lg text-slate-300 leading-relaxed">
            <strong>SecureReset</strong> replaces naive reset links with defense-in-depth:
            anti-enumeration responses, 256-bit device-bound hashed tokens, 6-digit OTPs,
            adaptive risk scoring, TOTP MFA, HIBP k-anonymity checks, and live SOC telemetry.
          </p>

          <div className="flex flex-wrap gap-3 pt-2">
            <Link
              href="/register"
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-slate-950 hover:bg-emerald-400 transition-colors"
            >
              Create Account &amp; Enroll MFA
            </Link>
            <Link
              href="/forgot-password"
              className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-5 py-2.5 text-sm font-medium text-slate-100 hover:border-slate-500 transition-colors"
            >
              <KeyRound className="h-4 w-4 text-emerald-400" />
              Test Password Reset Flow
            </Link>
            <Link
              href="/simulator"
              className="inline-flex items-center gap-2 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-5 py-2.5 text-sm font-medium text-cyan-200 hover:bg-cyan-500/20 transition-colors"
            >
              <Terminal className="h-4 w-4" />
              Launch Attack Simulator
            </Link>
            <Link
              href="/security-dashboard"
              className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-5 py-2.5 text-sm font-medium text-slate-200 hover:border-slate-500 transition-colors"
            >
              <Activity className="h-4 w-4 text-amber-400" />
              View Security Dashboard
            </Link>
          </div>
        </div>
      </section>

      <section className="space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-white">Defense-in-Depth Layers</h2>
          <span className="text-xs font-mono text-slate-400">5-STAGE PIPELINE</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {LAYERS.map((layer) => {
            const Icon = layer.icon
            return (
              <div
                key={layer.title}
                className="rounded-xl border border-slate-800 bg-slate-900/50 p-6 space-y-2.5"
              >
                <div className="flex items-center gap-2.5 text-emerald-400 font-semibold text-sm">
                  <Icon className="h-4 w-4 shrink-0" />
                  <h3 className="text-slate-100">{layer.title}</h3>
                </div>
                <p className="text-sm text-slate-400 leading-relaxed">{layer.desc}</p>
              </div>
            )
          })}
        </div>
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h3 className="text-base font-semibold text-white">Ready to demonstrate blocked attacks?</h3>
          <p className="text-sm text-slate-400">
            Run OTP brute-force, token replay, enumeration probes, and cross-device hijack simulations
            against a side-by-side Naive Reset comparison.
          </p>
        </div>
        <Link
          href="/simulator"
          className="shrink-0 rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-white transition-colors"
        >
          Open Attack Simulator →
        </Link>
      </section>
    </div>
  )
}
