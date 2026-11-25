import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { getCollections } from '@/lib/db/mongodb'
import { getEnvSecret, verifyHmac } from '@/lib/security/crypto'

const GENERIC_STATUS_TEXT =
  'If your verification was accepted, your reset is scheduled to complete at the displayed time unless cancelled by the account owner.'

export async function GET(req: NextRequest) {
  const handle = req.nextUrl.searchParams.get('h')
  if (!handle) {
    return NextResponse.json({ valid: false, statusText: GENERIC_STATUS_TEXT })
  }

  const parts = handle.split('.')
  if (parts.length !== 2) {
    return NextResponse.json({ valid: false, statusText: GENERIC_STATUS_TEXT })
  }

  const [payload, sig] = parts
  if (!verifyHmac(payload, sig, getEnvSecret('SESSION_SECRET'))) {
    return NextResponse.json({ valid: false, statusText: GENERIC_STATUS_TEXT })
  }

  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      resetId?: string
    }
    if (!parsed.resetId || !ObjectId.isValid(parsed.resetId)) {
      return NextResponse.json({ valid: false, statusText: GENERIC_STATUS_TEXT })
    }

    const { resetTokens } = await getCollections()
    const doc = await resetTokens.findOne({ _id: new ObjectId(parsed.resetId) })
    if (!doc || !doc.completesAt) {
      return NextResponse.json({ valid: false, statusText: GENERIC_STATUS_TEXT })
    }

    const hhmm = doc.completesAt.toISOString().slice(11, 16) + ' UTC'
    const statusText =
      doc.state === 'vetoed' || doc.state === 'cancelled'
        ? 'This password reset request has been cancelled.'
        : doc.state === 'completed'
          ? 'This password reset has completed.'
          : `Your reset completes at ${hhmm} unless cancelled.`

    return NextResponse.json({
      valid: true,
      state: doc.state,
      completesAt: doc.completesAt.toISOString(),
      coolingOffHours: doc.coolingOffHours ?? 0,
      statusText,
    })
  } catch {
    return NextResponse.json({ valid: false, statusText: GENERIC_STATUS_TEXT })
  }
}
