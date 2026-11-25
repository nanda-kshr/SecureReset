import nodemailer from 'nodemailer'
import { ConfirmedChannel, getCollections } from '@/lib/db/mongodb'
import { maskEmailForDisplay } from '@/lib/security/crypto'

function getTransporter() {
  const host = process.env.SMTP_HOST
  const port = Number(process.env.SMTP_PORT || 465)
  const secure = process.env.SMTP_SECURE === 'true'
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS

  if (!host || !user || !pass) {
    return null
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  })
}

async function sendAndLogEmail(params: {
  to: string
  subject: string
  html: string
  text: string
  template: 'reset_instructions' | 'password_changed' | 'cooling_off_veto' | 'security_alert'
}) {
  const { emailLogs } = await getCollections()
  const from = process.env.SMTP_MAIL || process.env.SMTP_USER || 'no-reply@securereset.local'
  const transporter = getTransporter()
  const maskedRecipient = maskEmailForDisplay(params.to)

  if (!transporter) {
    await emailLogs.insertOne({
      to: maskedRecipient,
      subject: params.subject,
      template: params.template,
      status: 'failed',
      error: 'SMTP credentials not configured',
      createdAt: new Date(),
    })
    return { sent: false, error: 'SMTP credentials not configured' }
  }

  try {
    const info = await transporter.sendMail({
      from: `"SecureReset Security" <${from}>`,
      to: params.to,
      subject: params.subject,
      text: params.text,
      html: params.html,
    })

    await emailLogs.insertOne({
      to: maskedRecipient,
      subject: params.subject,
      template: params.template,
      status: 'sent',
      messageId: info.messageId,
      createdAt: new Date(),
    })

    return { sent: true, messageId: info.messageId }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown SMTP error'
    await emailLogs.insertOne({
      to: maskedRecipient,
      subject: params.subject,
      template: params.template,
      status: 'failed',
      error: message,
      createdAt: new Date(),
    })
    return { sent: false, error: message }
  }
}

export async function sendPasswordResetEmail(params: {
  to: string
  name: string
  resetUrl: string
  otp?: string
  riskLevel: string
  ip: string
  location: string
  expiresMinutes: number
}) {
  const subject = 'SecureReset: Password Reset Verification'
  const otpLine = params.otp
    ? `One-Time Verification Code (OTP): ${params.otp}\n`
    : ''
  const text = [
    `Hello ${params.name},`,
    '',
    'We received a password reset request for your SecureReset account.',
    `Origin: ${params.location} (IP: ${params.ip}) | Risk Tier: ${params.riskLevel.toUpperCase()}`,
    '',
    otpLine + `Single-Use Reset Link (expires in ${params.expiresMinutes} minutes):`,
    params.resetUrl,
    '',
    'If you did not request this, sign in immediately or ignore this message.',
  ].join('\n')

  const html = `
  <div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#ffffff;color:#09090b;border:1px solid #e4e4e7;border-radius:8px;">
    <h2 style="margin:0 0 12px;color:#09090b;">SecureReset Password Verification</h2>
    <p>Hello ${params.name},</p>
    <p>We received a request to reset your password.</p>
    ${
      params.otp
        ? `<div style="background:#f4f4f5;padding:16px;border-radius:6px;margin:16px 0;text-align:center;">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#52525b;">6-Digit Security OTP</div>
      <div style="font-size:30px;font-weight:700;letter-spacing:6px;color:#09090b;margin-top:6px;">${params.otp}</div>
    </div>`
        : ''
    }
    <p style="text-align:center;margin:20px 0;">
      <a href="${params.resetUrl}" style="display:inline-block;background:#09090b;color:#ffffff;font-weight:600;padding:12px 24px;border-radius:6px;text-decoration:none;">Verify &amp; Reset Password</a>
    </p>
    <p style="font-size:13px;color:#52525b;">
      <strong>Origin:</strong> ${params.location} (${params.ip})<br/>
      <strong>Expires in:</strong> ${params.expiresMinutes} minutes (single-use)
    </p>
  </div>`

  return sendAndLogEmail({
    to: params.to,
    subject,
    text,
    html,
    template: 'reset_instructions',
  })
}

export async function sendCoolingOffVetoEmail(params: {
  channels: ConfirmedChannel[]
  name: string
  vetoUrl: string
  completesAt: Date
  delayHours: number
  ip: string
  location: string
}) {
  const subject = 'URGENT: Password reset pending — Veto if this was not you'
  const completesStr = params.completesAt.toUTCString()
  const text = [
    `Hello ${params.name},`,
    '',
    `A password reset for your SecureReset account has entered a ${params.delayHours}h cooling-off period.`,
    `Unless cancelled, it will complete at: ${completesStr}`,
    `Request origin: ${params.location} (${params.ip})`,
    '',
    `If THIS WAS NOT YOU, cancel immediately using this single-use link:`,
    params.vetoUrl,
  ].join('\n')

  const html = `
  <div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#ffffff;color:#09090b;border:1px solid #fecdd3;border-radius:8px;">
    <h2 style="margin:0 0 12px;color:#9f1239;">Pending Password Reset Notice</h2>
    <p>Hello ${params.name},</p>
    <p>A password reset entered a <strong>${params.delayHours}-hour cooling-off delay</strong> and will complete at <strong>${completesStr}</strong> unless cancelled.</p>
    <p style="font-size:13px;color:#52525b;">Origin: ${params.location} (${params.ip})</p>
    <p style="text-align:center;margin:24px 0;">
      <a href="${params.vetoUrl}" style="display:inline-block;background:#be123c;color:#ffffff;font-weight:700;padding:12px 24px;border-radius:6px;text-decoration:none;">This Wasn't Me — Cancel Reset</a>
    </p>
    <p style="font-size:12px;color:#52525b;">You can also cancel by signing in with your existing password.</p>
  </div>`

  const verifiedChannels = params.channels.filter((c) => c.verified)
  return Promise.allSettled(
    verifiedChannels.map((ch) =>
      sendAndLogEmail({
        to: ch.value,
        subject,
        text,
        html,
        template: 'cooling_off_veto',
      })
    )
  )
}

export async function sendPasswordChangedAlertEmail(params: {
  to: string
  channels?: ConfirmedChannel[]
  name: string
  ip: string
  location: string
  revokedSessionsCount: number
  probationHours?: number
}) {
  const subject = 'SecureReset Alert: Your password was changed'
  const timestamp = new Date().toUTCString()
  const text = [
    `Hello ${params.name},`,
    '',
    `Your SecureReset password was changed on ${timestamp}.`,
    `Origin: ${params.location} (${params.ip})`,
    `All active sessions (${params.revokedSessionsCount}), refresh tokens, and API keys have been invalidated.`,
    params.probationHours
      ? `Post-reset probation (${params.probationHours}h) is now active on sensitive settings.`
      : '',
  ]
    .filter(Boolean)
    .join('\n')

  const html = `
  <div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#ffffff;color:#09090b;border:1px solid #e4e4e7;border-radius:8px;">
    <h2 style="margin:0 0 12px;color:#09090b;">Password Changed Confirmation</h2>
    <p>Hello ${params.name},</p>
    <p>Your SecureReset password was updated on <strong>${timestamp}</strong>.</p>
    <ul style="font-size:14px;color:#3f3f46;line-height:1.6;">
      <li><strong>Location:</strong> ${params.location} (${params.ip})</li>
      <li><strong>Sessions Invalidated:</strong> ${params.revokedSessionsCount} session(s) + all API/refresh tokens</li>
      ${params.probationHours ? `<li><strong>Security Probation:</strong> ${params.probationHours} hours</li>` : ''}
    </ul>
  </div>`

  const targets =
    params.channels && params.channels.length > 0
      ? Array.from(new Set(params.channels.filter((c) => c.verified).map((c) => c.value)))
      : [params.to]

  const results = await Promise.allSettled(
    targets.map((recipient) =>
      sendAndLogEmail({
        to: recipient,
        subject,
        text,
        html,
        template: 'password_changed',
      })
    )
  )
  return results[0]
}
