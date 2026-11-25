# SecureReset — Recovery Assurance Framework

An open, parameterized, and experimentally evaluated password recovery framework built on Next.js 16, MongoDB, WebCrypto, and Nodemailer.

> **Honesty Note:** Individual building blocks used in this project (device-bound cryptographic keys, cooling-off delays, victim vetoes, and post-recovery probation) exist in commercial identity systems such as Apple, Google, and Microsoft. This project's contribution is an open, centralized, parameterized implementation and comparative evaluation harness (`naive` vs. `standard` vs. `framework`).

## Core Design Principles
1. A reset must never be easier than the strongest login method on the account (`password < totp < passkey`).
2. A compromised mailbox alone must not allow instant account takeover.
3. All scoring weights, delay curves, probation windows, and evaluation modes live in one centralized config ([lib/recovery/config.ts](lib/recovery/config.ts)) and emit PII-free structured JSON telemetry.

## Architecture Highlights
- **Phase 1 — Hardened Baseline:** 256-bit CSPRNG reset tokens stored as SHA-256 hashes, HMAC-salted 6-digit OTPs, fixed `APP_BASE_URL` (ignoring `Host` / `X-Forwarded-Host`), `Referrer-Policy: no-referrer` on reset/veto routes, timing-equalized anti-enumeration responses, `zxcvbn` + HIBP k-anonymity + password history checks, full credential revocation on reset (preserving MFA, never auto-logging in).
- **Phase 2 — Risk-Adaptive Cooling-Off & Victim Veto:** Centralized assurance scoring (`0–100`) mapped against required assurance via selectable `piecewise-linear` or `logistic` delay curves (`0–72h`), server-enforced state machine (`requested -> email_verified -> pending_cooling_off -> completed | vetoed | expired | cancelled`), one-tap signed veto links across all confirmed channels, active-session veto banner, login-cancels-reset, and 80-bit hashed single-use recovery codes.
- **Phase 3 — Browser-Bound Key Signal:** Explicit post-login WebCrypto ECDSA P-256 (`extractable: false`) keypair stored in IndexedDB. Missing/cleared keys are treated as normal fallback to cooling-off rather than lockout.
  - **Security Caveat:** `extractable: false` prevents key extraction from IndexedDB, **not** XSS signing-oracle abuse on the same origin. Strict `Content-Security-Policy` headers in `proxy.ts` mitigate XSS, and the key is treated as one assurance signal rather than a sole guarantee.
- **Phase 4 — Post-Reset Probation:** Central policy guard (`lib/recovery/probation.ts`) blocking email changes, MFA modifications, browser-key/passkey enrollment, recovery edits, data exports, and API key creation for 48h after reset.
- **Phase 5 — Evaluation & Instrumentation:** `RESET_MODE` (`naive | standard | framework`), PII-free JSON telemetry, localhost-guarded `/attacks` harness, Monte Carlo evaluation simulator with CSV export, and admin SOC charts.

## Running & Testing
```bash
npm install
npm run dev
npm run test:run

# Run localhost-only attack checks (requires local dev server running)
node attacks/run-attacks.mjs http://localhost:3000

# Run Monte Carlo evaluation and export CSV
node attacks/simulate-evaluation.mjs
```
