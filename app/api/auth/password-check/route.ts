import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { checkHibpBreach, checkPasswordStrength } from '@/lib/security/password'

const Schema = z.object({
  password: z.string().max(128),
  userInputs: z.array(z.string()).optional(),
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const parsed = Schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
    }

    const { password, userInputs = [] } = parsed.data
    if (!password) {
      return NextResponse.json({
        score: 0,
        acceptable: false,
        cracksDisplay: 'instant',
        feedback: ['Enter a password to evaluate strength.'],
        breached: false,
        breachCount: 0,
      })
    }

    const strength = checkPasswordStrength(password, userInputs)
    const hibp = password.length >= 6 ? await checkHibpBreach(password) : { breached: false, count: 0, source: 'hibp' as const }

    return NextResponse.json({
      score: strength.score,
      acceptable: strength.acceptable && !hibp.breached,
      cracksDisplay: strength.cracksDisplay,
      feedback: strength.feedback,
      breached: hibp.breached,
      breachCount: hibp.count,
      breachSource: hibp.source,
    })
  } catch {
    return NextResponse.json({ error: 'Unable to check password' }, { status: 500 })
  }
}
