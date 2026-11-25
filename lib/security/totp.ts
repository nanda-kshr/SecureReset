import speakeasy from 'speakeasy'
import QRCode from 'qrcode'

export async function generateTotpEnrollment(email: string) {
  const secret = speakeasy.generateSecret({
    name: `SecureReset (${email})`,
    issuer: 'SecureReset',
    length: 20,
  })

  const otpauthUrl = secret.otpauth_url || ''
  const qrDataUrl = await QRCode.toDataURL(otpauthUrl)

  return {
    base32: secret.base32,
    otpauthUrl,
    qrDataUrl,
  }
}

export function verifyTotpCode(base32Secret: string, token: string): boolean {
  const sanitized = token.replace(/\s+/g, '')
  if (!/^\d{6}$/.test(sanitized)) {
    return false
  }
  return speakeasy.totp.verify({
    secret: base32Secret,
    encoding: 'base32',
    token: sanitized,
    window: 1,
  })
}
