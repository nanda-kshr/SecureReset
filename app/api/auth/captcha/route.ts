import { NextResponse } from 'next/server'
import { createCaptchaChallenge } from '@/lib/security/captcha'

export async function GET() {
  const challenge = createCaptchaChallenge()
  return NextResponse.json(challenge)
}
