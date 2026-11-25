import { getCollections } from '@/lib/db/mongodb'

export interface RateLimitStatus {
  allowed: boolean
  remaining: number
  lockedUntil: Date | null
  requiresCaptcha: boolean
  consecutiveFailures: number
  retryAfterSeconds: number
}

export async function checkRateLimit(params: {
  key: string
  maxRequests: number
  windowMs: number
  captchaThreshold?: number
}): Promise<RateLimitStatus> {
  const { key, maxRequests, windowMs, captchaThreshold = 2 } = params
  const { rateLimits } = await getCollections()
  const now = new Date()

  const existing = await rateLimits.findOne({ key })
  if (!existing) {
    await rateLimits.updateOne(
      { key },
      {
        $setOnInsert: {
          key,
          count: 1,
          consecutiveFailures: 0,
          windowStart: now,
          lockedUntil: null,
          updatedAt: now,
        },
      },
      { upsert: true }
    )
    return {
      allowed: true,
      remaining: Math.max(0, maxRequests - 1),
      lockedUntil: null,
      requiresCaptcha: false,
      consecutiveFailures: 0,
      retryAfterSeconds: 0,
    }
  }

  if (existing.lockedUntil && existing.lockedUntil > now) {
    const retryAfterSeconds = Math.ceil((existing.lockedUntil.getTime() - now.getTime()) / 1000)
    return {
      allowed: false,
      remaining: 0,
      lockedUntil: existing.lockedUntil,
      requiresCaptcha: existing.consecutiveFailures >= captchaThreshold,
      consecutiveFailures: existing.consecutiveFailures,
      retryAfterSeconds,
    }
  }

  const windowExpired = now.getTime() - existing.windowStart.getTime() > windowMs
  if (windowExpired) {
    await rateLimits.updateOne(
      { key },
      {
        $set: {
          count: 1,
          windowStart: now,
          lockedUntil: null,
          updatedAt: now,
        },
      }
    )
    return {
      allowed: true,
      remaining: Math.max(0, maxRequests - 1),
      lockedUntil: null,
      requiresCaptcha: existing.consecutiveFailures >= captchaThreshold,
      consecutiveFailures: existing.consecutiveFailures,
      retryAfterSeconds: 0,
    }
  }

  const nextCount = existing.count + 1
  if (nextCount > maxRequests) {
    const lockedUntil = new Date(existing.windowStart.getTime() + windowMs)
    await rateLimits.updateOne(
      { key },
      {
        $set: {
          count: nextCount,
          lockedUntil,
          updatedAt: now,
        },
      }
    )
    return {
      allowed: false,
      remaining: 0,
      lockedUntil,
      requiresCaptcha: true,
      consecutiveFailures: existing.consecutiveFailures,
      retryAfterSeconds: Math.max(1, Math.ceil((lockedUntil.getTime() - now.getTime()) / 1000)),
    }
  }

  await rateLimits.updateOne(
    { key },
    {
      $set: {
        count: nextCount,
        updatedAt: now,
      },
    }
  )

  return {
    allowed: true,
    remaining: Math.max(0, maxRequests - nextCount),
    lockedUntil: null,
    requiresCaptcha: existing.consecutiveFailures >= captchaThreshold,
    consecutiveFailures: existing.consecutiveFailures,
    retryAfterSeconds: 0,
  }
}

export async function recordFailure(params: {
  key: string
  maxFailuresBeforeLockout?: number
  lockoutMs?: number
  captchaThreshold?: number
}): Promise<RateLimitStatus> {
  const {
    key,
    maxFailuresBeforeLockout = 5,
    lockoutMs = 15 * 60 * 1000,
    captchaThreshold = 2,
  } = params
  const { rateLimits } = await getCollections()
  const now = new Date()

  const existing = await rateLimits.findOne({ key })
  const consecutiveFailures = (existing?.consecutiveFailures ?? 0) + 1
  const shouldLock = consecutiveFailures >= maxFailuresBeforeLockout
  const lockedUntil = shouldLock ? new Date(now.getTime() + lockoutMs) : existing?.lockedUntil ?? null

  await rateLimits.updateOne(
    { key },
    {
      $set: {
        consecutiveFailures,
        lockedUntil,
        updatedAt: now,
      },
      $setOnInsert: {
        key,
        count: 1,
        windowStart: now,
      },
    },
    { upsert: true }
  )

  return {
    allowed: !shouldLock,
    remaining: Math.max(0, maxFailuresBeforeLockout - consecutiveFailures),
    lockedUntil,
    requiresCaptcha: consecutiveFailures >= captchaThreshold,
    consecutiveFailures,
    retryAfterSeconds: lockedUntil ? Math.max(1, Math.ceil((lockedUntil.getTime() - now.getTime()) / 1000)) : 0,
  }
}

export async function getFailureStatus(key: string, captchaThreshold = 2): Promise<{
  requiresCaptcha: boolean
  consecutiveFailures: number
  lockedUntil: Date | null
}> {
  const { rateLimits } = await getCollections()
  const existing = await rateLimits.findOne({ key })
  const now = new Date()
  if (!existing) {
    return { requiresCaptcha: false, consecutiveFailures: 0, lockedUntil: null }
  }
  const lockedUntil = existing.lockedUntil && existing.lockedUntil > now ? existing.lockedUntil : null
  return {
    requiresCaptcha: existing.consecutiveFailures >= captchaThreshold,
    consecutiveFailures: existing.consecutiveFailures,
    lockedUntil,
  }
}

export async function resetRateLimit(key: string): Promise<void> {
  const { rateLimits } = await getCollections()
  await rateLimits.deleteOne({ key })
}
