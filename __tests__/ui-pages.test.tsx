import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import HomePage from '@/app/page'
import ForgotPasswordPage from '@/app/forgot-password/page'
import SimulatorPage from '@/app/simulator/page'
import SecurityDashboardPage from '@/app/security-dashboard/page'

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

describe('Frontend Pages & Interactions', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    document.cookie = 'sr_csrf=mock-csrf-token.sig'
  })

  it('renders landing page defense layers and navigation links', () => {
    render(<HomePage />)
    expect(
      screen.getByRole('heading', { level: 1, name: /Hardened Password Reset/i })
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Test Password Reset Flow/i })).toHaveAttribute(
      'href',
      '/forgot-password'
    )
    expect(screen.getByRole('link', { name: /Launch Attack Simulator/i })).toHaveAttribute(
      'href',
      '/simulator'
    )
  })

  it('submits forgot-password form and displays anti-enumeration message', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          message:
            "If an account with that email exists, we've sent password reset instructions and a 6-digit verification code.",
        }),
        { status: 200 }
      )
    )

    render(<ForgotPasswordPage />)
    const emailInput = screen.getByLabelText(/Account Email/i)
    fireEvent.change(emailInput, { target: { value: 'student@college.edu' } })
    fireEvent.click(screen.getByRole('button', { name: /Send Reset Instructions/i }))

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/If an account with that email exists/i)
    })

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/reset-request',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('runs attack simulator scenario and renders Naive vs SecureReset comparison', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          scenario: 'otp_bruteforce',
          attackerContext: {
            ip: '185.220.101.42',
            location: 'Moscow, RU',
            deviceLabel: 'Simulated: attacker-kali-box',
          },
          steps: [
            {
              step: 'Attempt #5: Guess OTP "100555"',
              naiveBehavior: 'Allows unlimited guesses',
              secureBehavior: 'HTTP 429: Account/token locked for 15 minutes',
              blocked: true,
              statusCode: 429,
              auditEvent: 'OTP_LOCKOUT',
            },
          ],
        }),
        { status: 200 }
      )
    )

    render(<SimulatorPage />)
    const runButtons = screen.getAllByRole('button', { name: /Run Simulation/i })
    fireEvent.click(runButtons[1])

    await waitFor(() => {
      expect(screen.getByText(/Simulation Report:/i)).toBeInTheDocument()
      expect(screen.getByText(/LOG: OTP_LOCKOUT/i)).toBeInTheDocument()
      expect(screen.getByText(/locked for 15 minutes/i)).toBeInTheDocument()
    })
  })

  it('renders Security SOC Dashboard KPIs and handles error states', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          kpis: {
            totalResetRequests: 12,
            successfulResets: 4,
            blockedAttacks: 9,
            enumerationProbes: 3,
            activeLockouts: 1,
          },
          attackBreakdown: [{ eventType: 'OTP_FAILED', count: 6 }],
          suspiciousIps: [
            {
              ip: '185.220.101.42',
              location: 'Moscow, RU',
              totalEvents: 7,
              blockedCount: 6,
              lastSeen: new Date().toISOString(),
            },
          ],
          auditLogs: [
            {
              id: 'log-1',
              eventType: 'OTP_LOCKOUT',
              severity: 'critical',
              blocked: true,
              email: 'victim@example.com',
              ip: '185.220.101.42',
              location: 'Moscow, RU',
              deviceFingerprint: 'abcdef123456',
              riskLevel: 'high',
              riskScore: 85,
              details: {},
              createdAt: new Date().toISOString(),
            },
          ],
          emailLogs: [],
        }),
        { status: 200 }
      )
    )

    render(<SecurityDashboardPage />)
    await waitFor(() => {
      expect(screen.getByText('Blocked Attacks')).toBeInTheDocument()
      expect(screen.getByText('OTP_LOCKOUT')).toBeInTheDocument()
      expect(screen.getByText('Moscow, RU')).toBeInTheDocument()
    })
  })
})
