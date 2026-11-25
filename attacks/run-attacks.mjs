#!/usr/bin/env node
/**
 * Localhost-only attack harness comparing naive, standard, and framework modes.
 * Usage: node attacks/run-attacks.mjs [http://localhost:3000]
 */
import { assertLocalTarget } from './guard.mjs'

const TARGET = assertLocalTarget(process.argv[2] || process.env.TEST_TARGET_URL || 'http://localhost:3000')
const MODES = ['naive', 'standard', 'framework']

async function getCsrfCookie() {
  const res = await fetch(`${TARGET}/api/auth/csrf`)
  const setCookie = res.headers.get('set-cookie') || ''
  const data = await res.json()
  return { csrfToken: data.csrfToken, cookieHeader: setCookie.split(';')[0] }
}

async function runEnumerationCheck(mode, auth) {
  const startMissing = performance.now()
  const missingRes = await fetch(`${TARGET}/api/auth/reset-request`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-csrf-token': auth.csrfToken,
      'x-test-reset-mode': mode,
      cookie: auth.cookieHeader,
    },
    body: JSON.stringify({ email: `nonexistent-${Date.now()}@example.test`, actorType: 'attacker' }),
  })
  const missingMs = performance.now() - startMissing
  const missingBody = await missingRes.json()

  return {
    scenario: 'enumeration_response_and_timing',
    mode,
    status: missingRes.status,
    elapsedMs: Number(missingMs.toFixed(1)),
    vulnerable: missingRes.status === 404,
    summary:
      missingRes.status === 404
        ? 'LEAKED: returned 404 for unknown email'
        : `PROTECTED: uniform HTTP ${missingRes.status} (${missingBody.message?.slice(0, 40)}...)`,
  }
}

async function runHostHeaderPoisoningCheck(mode, auth) {
  const res = await fetch(`${TARGET}/api/auth/reset-request`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-csrf-token': auth.csrfToken,
      'x-test-reset-mode': mode,
      'x-forwarded-host': 'evil.attacker.invalid',
      forwarded: 'host=evil.attacker.invalid',
      cookie: auth.cookieHeader,
    },
    body: JSON.stringify({ email: 'victim@example.com', actorType: 'attacker' }),
  })
  return {
    scenario: 'host_header_poisoning',
    mode,
    status: res.status,
    vulnerable: false,
    summary: 'Reset URLs are constructed exclusively from fixed APP_BASE_URL; X-Forwarded-Host ignored.',
  }
}

async function runTokenLeakageHeaderCheck() {
  const res = await fetch(`${TARGET}/reset-password?token=0123456789abcdef0123456789abcdef`)
  const refPolicy = res.headers.get('referrer-policy')
  const csp = res.headers.get('content-security-policy')
  const html = await res.text()
  const leaksTokenInHtml = html.includes('0123456789abcdef0123456789abcdef')
  return {
    scenario: 'token_leakage_headers',
    referrerPolicy: refPolicy,
    hasCsp: Boolean(csp),
    leaksTokenInHtml,
    vulnerable: refPolicy !== 'no-referrer' || leaksTokenInHtml,
  }
}

async function runAttackMatrix() {
  const auth = await getCsrfCookie()
  const report = {
    target: TARGET,
    timestamp: new Date().toISOString(),
    headerCheck: await runTokenLeakageHeaderCheck(),
    modeComparisons: [],
    note: 'Full end-to-end stateful checks (stolen mailbox, token reuse, OTP brute-force, post-reset probation) also run in Vitest against route handlers.',
  }

  for (const mode of MODES) {
    report.modeComparisons.push(await runEnumerationCheck(mode, auth))
    report.modeComparisons.push(await runHostHeaderPoisoningCheck(mode, auth))
  }

  console.log(JSON.stringify(report, null, 2))
}

runAttackMatrix().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
