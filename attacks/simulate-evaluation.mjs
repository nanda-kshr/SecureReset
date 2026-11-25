#!/usr/bin/env node
/**
 * Evaluation Simulation Script (Phase 5)
 * Replays N legitimate and N attacker reset attempts across `naive`, `standard`, and `framework` modes.
 *
 * SIMULATION ASSUMPTIONS (clearly labelled):
 * 1. Attacker compromise model:
 *    - `stolen_mailbox`: Attacker controls the user's mailbox (has email link & OTP) but lacks
 *      the WebCrypto browser-bound key, security question/TOTP, and recovery code.
 *    - `otp_bruteforce`: Attacker guesses OTPs without mailbox access.
 *    - `token_replay`: Attacker replays an already-used token.
 * 2. Victim veto reaction-time distribution:
 *    - Modeled as a log-normal distribution (median = 3.5 hours, sigma = 0.9) representing
 *      typical email/push notification notice-and-click latency when a pending reset alert arrives.
 *    - Notification delivery/awareness probability = 0.92 (8% missed notifications).
 * 3. Legitimate user model:
 *    - 75% originate from a trusted browser with WebCrypto P-256 key + known device/IP (0h delay).
 *    - 25% originate from an evicted/new browser (no key) on a password+TOTP account, experiencing
 *      adaptive cooling-off delay unless using a pre-issued recovery code (30% hold recovery code).
 */
import fs from 'node:fs'
import path from 'node:path'

const N = Number(process.env.SIM_TRIALS || 500)
const CURVE_SHAPE = process.env.COOLING_CURVE_SHAPE || 'piecewise-linear'

// Seeded PRNG (Mulberry32) for reproducible evaluation results
function createPrng(seed = 20261125) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function sampleNormal(rand) {
  const u1 = Math.max(1e-9, rand())
  const u2 = rand()
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
}

function sampleVictimReactionHours(rand, medianHours = 3.5, sigma = 0.9) {
  return Math.exp(Math.log(medianHours) + sigma * sampleNormal(rand))
}

function mapGapToDelayHours(gap, shape = CURVE_SHAPE) {
  const g = Math.max(0, Math.min(100, gap))
  if (g <= 0) return 0
  if (shape === 'logistic') {
    const midpoint = 40
    const steepness = 0.1
    const raw = 1 / (1 + Math.exp(-steepness * (g - midpoint)))
    const zero = 1 / (1 + Math.exp(-steepness * (0 - midpoint)))
    return Number((Math.max(0, (raw - zero) / (1 - zero)) * 72).toFixed(2))
  }
  const pts = [
    [0, 0],
    [15, 1],
    [35, 12],
    [60, 36],
    [85, 72],
  ]
  if (g >= 85) return 72
  for (let i = 0; i < pts.length - 1; i++) {
    const [g0, h0] = pts[i]
    const [g1, h1] = pts[i + 1]
    if (g >= g0 && g <= g1) {
      return Number((h0 + ((g - g0) / (g1 - g0)) * (h1 - h0)).toFixed(2))
    }
  }
  return 72
}

function simulateMode(mode, trials, rand) {
  const scenarios = ['stolen_mailbox', 'otp_bruteforce', 'token_replay']
  const scenarioMetrics = {}

  for (const scenario of scenarios) {
    let attackerSuccess = 0
    let enteredCoolingOff = 0
    let vetoedInWindow = 0

    for (let i = 0; i < trials; i++) {
      if (scenario === 'otp_bruteforce') {
        // Naive has no attempt limit; standard/framework lock out after 5 attempts (prob 5/10^6)
        if (mode === 'naive') attackerSuccess++
        else if (rand() < 5 / 1_000_000) attackerSuccess++
      } else if (scenario === 'token_replay') {
        // Naive often allows reuse within TTL; standard/framework strictly enforce single-use hash
        if (mode === 'naive' && rand() < 0.65) attackerSuccess++
      } else if (scenario === 'stolen_mailbox') {
        if (mode === 'naive') {
          attackerSuccess++
        } else if (mode === 'standard') {
          // Attacker has mailbox link + OTP; blocked only if account has TOTP/security question or strict device cookie
          const hasMfa = rand() < 0.45
          if (!hasMfa) attackerSuccess++
        } else {
          // Framework mode: attacker lacks browser key (+40) and known device (+20) and recovery code (+35)
          const required = rand() < 0.5 ? 75 : 50 // TOTP vs password-only
          const achieved = 0 // Foreign device, no browser key
          const gap = Math.max(0, required - achieved)
          const delayHours = mapGapToDelayHours(gap)
          if (delayHours > 0) {
            enteredCoolingOff++
            const ownerAware = rand() < 0.92
            const reactionHours = sampleVictimReactionHours(rand)
            if (ownerAware && reactionHours < delayHours) {
              vetoedInWindow++
            } else {
              attackerSuccess++
            }
          } else {
            attackerSuccess++
          }
        }
      }
    }

    scenarioMetrics[scenario] = {
      attackerSuccessRate: Number(((attackerSuccess / trials) * 100).toFixed(2)),
      vetoWindowCoverage:
        enteredCoolingOff > 0 ? Number(((vetoedInWindow / enteredCoolingOff) * 100).toFixed(2)) : 0,
    }
  }

  // Legitimate user trials
  let legitFalseBlocked = 0
  let totalRecoverHours = 0

  for (let i = 0; i < trials; i++) {
    if (mode === 'naive') {
      totalRecoverHours += 0.02
    } else if (mode === 'standard') {
      // Strict device binding blocks legitimate users who switched browsers/devices (~15%)
      const switchedDevice = rand() < 0.15
      if (switchedDevice) {
        legitFalseBlocked++
      } else {
        totalRecoverHours += 0.05
      }
    } else {
      // Framework mode: missing browser key is a normal fallback, never a hard block
      const hasBrowserKey = rand() < 0.75
      const hasKnownDevice = hasBrowserKey || rand() < 0.2
      const hasRecoveryCode = !hasBrowserKey && rand() < 0.3
      const required = rand() < 0.5 ? 75 : 50
      const achieved =
        (hasBrowserKey ? 40 : 0) +
        (hasKnownDevice ? 30 : 0) +
        (hasRecoveryCode ? 35 : 0)
      const gap = Math.max(0, required - achieved)
      const delay = mapGapToDelayHours(gap)
      totalRecoverHours += 0.05 + delay
    }
  }

  return {
    mode,
    curveShape: CURVE_SHAPE,
    trialsPerGroup: trials,
    scenarios: scenarioMetrics,
    legitimateFalseBlockRate: Number(((legitFalseBlocked / trials) * 100).toFixed(2)),
    avgLegitTimeToRecoverHours: Number((totalRecoverHours / trials).toFixed(2)),
  }
}

const rand = createPrng()
const results = ['naive', 'standard', 'framework'].map((mode) => simulateMode(mode, N, rand))

const csvLines = [
  'mode,curve_shape,trials,scenario,attacker_success_rate_pct,veto_window_coverage_pct,legit_false_block_rate_pct,avg_time_to_recover_hours',
]

for (const r of results) {
  for (const [scenario, metrics] of Object.entries(r.scenarios)) {
    csvLines.push(
      [
        r.mode,
        r.curveShape,
        r.trialsPerGroup,
        scenario,
        metrics.attackerSuccessRate,
        metrics.vetoWindowCoverage,
        r.legitimateFalseBlockRate,
        r.avgLegitTimeToRecoverHours,
      ].join(',')
    )
  }
}

const outDir = path.join(process.cwd(), 'attacks', 'results')
fs.mkdirSync(outDir, { recursive: true })
const csvPath = path.join(outDir, 'evaluation-results.csv')
fs.writeFileSync(csvPath, csvLines.join('\n') + '\n', 'utf8')

console.log(`Simulation complete (N=${N} per group, curve=${CURVE_SHAPE}). Exported: ${csvPath}`)
console.log(JSON.stringify(results, null, 2))
