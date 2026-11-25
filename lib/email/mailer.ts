import nodemailer from 'nodemailer'
import { getCollections } from '@/lib/db/mongodb'

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
  template: 'reset_instructions' | 'password_changed'
}) {
  const { emailLogs } = await getCollections()
  const from = process.env.SMTP_MAIL || process.env.SMTP_USER || 'no-reply@securereset.local'
  const transporter = getTransporter()

  if (!transporter) {
    await emailLogs.insertOne({
      to: params.to,
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
      to: params.to,
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
      to: params.to,
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
  otp: string
  riskLevel: string
  ip: string
  location: string
  expiresMinutes: number
}) {
  const subject = 'SecureReset: Password Reset Verification & OTP'
  const text = [
    `Hello ${params.name},`,
    '',
    'We received a password reset request for your SecureReset account.',
    `Request Origin: ${params.location} (IP: ${params.ip}) | Risk Level: ${params.riskLevel.toUpperCase()}`,
    '',
    `One-Time Verification Code (OTP): ${params.otp}`,
    `Single-Use Reset Link (expires in ${params.expiresMinutes} minutes):`,
    params.resetUrl,
    '',
    'This link is single-use and bound to the requesting device.',
    'If you did not request this, you can safely ignore this email.',
  ].join('\n')

  const html = `
  <div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#0f172a;color:#e2e8f0;border-radius:12px;">
    <h2 style="margin:0 0 12px;color:#34d399;">SecureReset Password Verification</h2>
    <p>Hello ${params.name},</p>
    <p>We received a request to reset your password. Use both the single-use verification link and your 6-digit OTP below:</p>
    <div style="background:#1e293b;padding:16px;border-radius:8px;margin:16px 0;text-align:center;">
      <div style="font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;">6-Digit Security OTP</div>
      <div style="font-size:32px;font-weight:700;letter-spacing:6px;color:#34d399;margin-top:6px;">${params.otp}</div>
    </div>
    <p style="text-align:center;margin:20px 0;">
      <a href="${params.resetUrl}" style="display:inline-block;background:#10b981;color:#022c22;font-weight:700;padding:12px 24px;border-radius:8px;text-decoration:none;">Verify &amp; Reset Password</a>
    </p>
    <p style="font-size:13px;color:#94a3b8;">
      <strong>Origin:</strong> ${params.location} (${params.ip})<br/>
      <strong>Risk Score Tier:</strong> ${params.riskLevel.toUpperCase()}<br/>
      <strong>Expires in:</strong> ${params.expiresMinutes} minutes (single-use, device-bound)
    </p>
    <hr style="border:none;border-top:1px solid #334155;margin:18px 0;"/>
    <p style="font-size:12px;color:#64748b;">If you did not initiate this reset, no changes have been made to your account.</p>
  </div>`

  return sendAndLogEmail({
    to: params.to,
    subject,
    text,
    html,
    template: 'reset_instructions',
  })
}

export async function sendPasswordChangedAlertEmail(params: {
  to: string
  name: string
  ip: string
  location: string
  revokedSessionsCount: number
}) {
  const subject = 'SecureReset Alert: Your password was changed'
  const timestamp = new Date().toUTCString()
  const text = [
    `Hello ${params.name},`,
    '',
    `Your SecureReset account password was changed on ${timestamp}.`,
    `Origin: ${params.location} (IP: ${params.ip})`,
    `All active sessions (${params.revokedSessionsCount}) have been invalidated for your protection.`,
    '',
    'If this was not you, contact security support immediately.',
  ].join('\n')

  const html = `
  <div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#0f172a;color:#e2e8f0;border-radius:12px;">
    <h2 style="margin:0 0 12px;color:#38bdf8;">Password Changed Confirmation</h2>
    <p>Hello ${params.name},</p>
    <p>Your SecureReset password was successfully updated on <strong>${timestamp}</strong>.</p>
    <ul style="font-size:14px;color:#cbd5e1;line-height:1.6;">
      <li><strong>Location:</strong> ${params.location}</li>
      <li><strong>IP Address:</strong> ${params.ip}</li>
      <li><strong>Sessions Invalidated:</strong> ${params.revokedSessionsCount} active session(s) signed out</li>
    </ul>
    <p style="font-size:12px;color:#94a3b8;">If you did not authorize this change, please contact an administrator immediately.</p>
  </div>`

  return sendAndLogEmail({
    to: params.to,
    subject,
    text,
    html,
    template: 'password_changed',
  })
}
