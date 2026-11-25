# SecureReset — Agent & Engineering Guide

## Project Overview
**SecureReset** is a hardened password reset capstone web application built with a unified **Next.js 16 (App Router + TypeScript)** full-stack architecture, **MongoDB**, and **Nodemailer (Gmail SMTP)**.

## Tech Stack
- **Framework:** Next.js 16.4.6 (App Router, `cacheComponents: true`, `proxy.ts`), React 19, TypeScript, Tailwind CSS v4
- **Database:** MongoDB (`mongodb` official Node.js driver)
- **Email:** Nodemailer (`nodemailer`) via Gmail SMTP (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_MAIL`, `SMTP_SECURE`)
- **Security Libraries:**
  - `bcryptjs` (cost 12) for password & security-answer hashing
  - Node `crypto` (SHA-256 / HMAC-SHA256 / `randomBytes` / `randomInt` / `timingSafeEqual`) for 256-bit tokens, 6-digit OTPs, CSRF tokens, and SVG CAPTCHA challenges
  - `zxcvbn` for password strength scoring (minimum score 3/4)
  - Have I Been Pwned (HIBP) k-anonymity range API (`https://api.pwnedpasswords.com/range/`) for breached password blocking
  - `speakeasy` + `qrcode` for RFC 6238 TOTP MFA
  - `zod` for request schema validation
- **Testing:** Vitest + React Testing Library (`jsdom`)
- **Test Command:** `npm test -- --run` (or `npx vitest run`)
- **Build / Lint Commands:** `npm run lint` and `npm run build`

## Conventions & Constraints
1. **Next.js 16 Rules:**
   - Read `node_modules/next/dist/docs/` before modifying Next.js conventions.
   - `proxy.ts` replaces `middleware.ts` in Next.js 16.
   - With `cacheComponents: true` in `next.config.ts`, any Server Component reading `cookies()`, `headers()`, or uncached DB data must be wrapped in `<Suspense>`.
2. **Security Invariants:**
   - Never store raw reset tokens, raw OTPs, or raw session tokens in MongoDB — store SHA-256 hashes only.
   - `POST /api/auth/reset-request` must always return the same anti-enumeration 200 response regardless of whether an email exists (unless rate-limited or CAPTCHA-challenged).
   - Reset tokens are 256-bit, single-use (`usedAt`), expire in 15 minutes, and are bound to the requesting `deviceFingerprint`.
   - After a successful password reset, all existing user sessions must be revoked (`revokedAt`), a notification email must be sent, and an audit log entry must be written.
   - Never commit `.env.local` or expose credentials in logs, UI responses, or documentation.
3. **Directory Structure:**
   - `lib/db/` — MongoDB client, collections, and index setup
   - `lib/security/` — crypto, password policy (zxcvbn + HIBP + reuse), risk scoring, rate limiter, CAPTCHA, CSRF, TOTP, session management
   - `lib/email/` — Nodemailer transporter and email templates + sanitized audit mirror
   - `app/api/` — Route Handlers for auth, reset flow, security dashboard, TOTP/profile, and attack simulator
   - `app/` — UI pages (`/`, `/register`, `/login`, `/forgot-password`, `/reset-password`, `/dashboard`, `/security-dashboard`, `/simulator`)
   - `__tests__/` — Unit, API route, and React component tests
