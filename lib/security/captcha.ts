import crypto from 'node:crypto'
import { getCollections } from '@/lib/db/mongodb'
import { getEnvSecret, signHmac, verifyHmac } from './crypto'

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const CAPTCHA_TTL_MS = 5 * 60 * 1000

export interface CaptchaChallenge {
  captchaToken: string
  svg: string
  expiresAt: string
}

function generateCaptchaCode(length = 5): string {
  let out = ''
  for (let i = 0; i < length; i++) {
    out += ALPHABET[crypto.randomInt(0, ALPHABET.length)]
  }
  return out
}

function renderCaptchaSvg(code: string): string {
  const chars = code.split('').map((ch, idx) => {
    const x = 22 + idx * 32
    const y = 34 + crypto.randomInt(-5, 6)
    const rotate = crypto.randomInt(-18, 19)
    return `<text x="${x}" y="${y}" transform="rotate(${rotate} ${x} ${y})" font-family="monospace" font-size="24" font-weight="700" fill="#fafafa">${ch}</text>`
  })

  const lines = Array.from({ length: 5 }, () => {
    const x1 = crypto.randomInt(0, 190)
    const y1 = crypto.randomInt(0, 56)
    const x2 = crypto.randomInt(0, 190)
    const y2 = crypto.randomInt(0, 56)
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#71717a" stroke-width="1.4" opacity="0.7"/>`
  })

  return `<svg xmlns="http://www.w3.org/2000/svg" width="190" height="56" viewBox="0 0 190 56" role="img" aria-label="Security CAPTCHA challenge">
  <rect width="190" height="56" rx="6" fill="#18181b"/>
  ${lines.join('\n  ')}
  ${chars.join('\n  ')}
</svg>`
}

export function createCaptchaChallenge(): CaptchaChallenge {
  const code = generateCaptchaCode(5)
  const nonce = crypto.randomBytes(12).toString('hex')
  const exp = Date.now() + CAPTCHA_TTL_MS
  const payload = Buffer.from(JSON.stringify({ nonce, code, exp })).toString('base64url')
  const sig = signHmac(payload, getEnvSecret('CAPTCHA_SECRET'))

  return {
    captchaToken: `${payload}.${sig}`,
    svg: renderCaptchaSvg(code),
    expiresAt: new Date(exp).toISOString(),
  }
}

export async function verifyCaptchaChallenge(
  captchaToken: string | undefined,
  answer: string | undefined
): Promise<{ valid: boolean; reason?: string }> {
  if (!captchaToken || !answer) {
    return { valid: false, reason: 'CAPTCHA solution is required.' }
  }

  const parts = captchaToken.split('.')
  if (parts.length !== 2) {
    return { valid: false, reason: 'Malformed CAPTCHA token.' }
  }

  const [payload, sig] = parts
  if (!verifyHmac(payload, sig, getEnvSecret('CAPTCHA_SECRET'))) {
    return { valid: false, reason: 'Invalid CAPTCHA signature.' }
  }

  let parsed: { nonce: string; code: string; exp: number }
  try {
    parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
  } catch {
    return { valid: false, reason: 'Invalid CAPTCHA payload.' }
  }

  if (Date.now() > parsed.exp) {
    return { valid: false, reason: 'CAPTCHA expired. Please refresh.' }
  }

  if (parsed.code.toUpperCase() !== answer.trim().toUpperCase()) {
    return { valid: false, reason: 'Incorrect CAPTCHA characters.' }
  }

  const { usedCaptchas } = await getCollections()
  try {
    await usedCaptchas.insertOne({
      nonce: parsed.nonce,
      expiresAt: new Date(parsed.exp),
    })
  } catch {
    return { valid: false, reason: 'CAPTCHA already used. Please request a new one.' }
  }

  return { valid: true }
}
