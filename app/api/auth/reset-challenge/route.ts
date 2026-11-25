import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getCollections } from '@/lib/db/mongodb'
import { jsonError, requireCsrf } from '@/lib/security/api-guard'
import { generateRandomToken, sha256 } from '@/lib/security/crypto'
import { RECOVERY_CONFIG } from '@/lib/recovery/config'

const ChallengeSchema = z.object({
  token: z.string().min(32),
})

export async function POST(req: NextRequest) {
  const csrfError = requireCsrf(req)
  if (csrfError) return csrfError

  try {
    const body = await req.json()
    const parsed = ChallengeSchema.safeParse(body)
    if (!parsed.success) {
      return jsonError('Valid reset token is required.', 400)
    }

    const tokenHash = sha256(parsed.data.token)
    const { resetTokens } = await getCollections()
    const now = new Date()
    const resetDoc = await resetTokens.findOne({
      tokenHash,
      usedAt: null,
      expiresAt: { $gt: now },
    })

    if (!resetDoc) {
      return jsonError('Invalid or expired reset token.', 400)
    }

    const challengeNonce = generateRandomToken(RECOVERY_CONFIG.tokens.challengeByteLength)
    const challengeExpiresAt = new Date(now.getTime() + 5 * 60 * 1000)

    await resetTokens.updateOne(
      { _id: resetDoc._id },
      { $set: { challengeNonce, challengeExpiresAt } }
    )

    return NextResponse.json({
      challengeNonce,
      expiresAt: challengeExpiresAt.toISOString(),
    })
  } catch {
    return jsonError('Unable to issue challenge nonce.', 500)
  }
}
