'use client'

import { useEffect, useState } from 'react'
import { ArrowRight, KeyRound, Lock, Mail, RefreshCw, ShieldAlert } from 'lucide-react'
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  CopyButton,
  CountdownTimer,
  DataTable,
  DataTableColumn,
  ExpandableExplainer,
  Modal,
  OtpInput,
  PasswordInput,
  RiskBadge,
  Skeleton,
  SkeletonCard,
  SkeletonText,
  StatusBadge,
  StepIndicator,
  TextInput,
  ThemeModeSelector,
  useToast,
} from '@/components/ui'

interface SampleRow {
  id: string
  timestamp: string
  account: string
  risk: 'low' | 'medium' | 'high'
  score: number
  outcome: string
}

const SAMPLE_ROWS: SampleRow[] = [
  {
    id: 'evt-01',
    timestamp: '2026-11-25 08:42 UTC',
    account: 'a***@college.edu',
    risk: 'low',
    score: 80,
    outcome: 'Verified',
  },
  {
    id: 'evt-02',
    timestamp: '2026-11-25 08:19 UTC',
    account: 'm***@example.com',
    risk: 'medium',
    score: 45,
    outcome: 'Cooling off (12h)',
  },
  {
    id: 'evt-03',
    timestamp: '2026-11-25 07:55 UTC',
    account: 'k***@corp.io',
    risk: 'high',
    score: 15,
    outcome: 'Vetoed by owner',
  },
]

const COLOR_TOKENS = [
  { name: 'Canvas', varName: '--bg-canvas', role: 'App background' },
  { name: 'Surface', varName: '--bg-surface', role: 'Card & form background' },
  { name: 'Subtle Surface', varName: '--bg-surface-subtle', role: 'Table headers, disclosures' },
  { name: 'Primary', varName: '--primary', role: 'Primary CTA & active focus' },
  { name: 'Info', varName: '--info-bg', role: 'Neutral security notices' },
  { name: 'Success / Low Risk', varName: '--success-bg', role: 'Verified / low risk' },
  { name: 'Warning / Medium Risk', varName: '--warning-bg', role: 'Cooling-off / medium risk' },
  { name: 'Danger / High Risk', varName: '--danger-bg', role: 'Destructive / high risk' },
]

export default function StyleguidePage() {
  const { toast } = useToast()

  // Form control demo state
  const [email, setEmail] = useState('alex@example.com')
  const [invalidEmail, setInvalidEmail] = useState('not-an-email')
  const [passwordStrong, setPasswordStrong] = useState('correct-horse-battery-92')
  const [passwordWeak, setPasswordWeak] = useState('password123')
  const [otpValue, setOtpValue] = useState('482')
  const [otpErrorValue, setOtpErrorValue] = useState('111111')

  // Interactive states
  const [btnLoading, setBtnLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [tableLoading, setTableLoading] = useState(false)
  const [tableEmpty, setTableEmpty] = useState(false)
  const [alertDismissed, setAlertDismissed] = useState(false)

  const [coolingTarget, setCoolingTarget] = useState<number>(0)

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      setCoolingTarget(Date.now() + 18 * 3600 * 1000 + 24 * 60 * 1000)
    })
    return () => cancelAnimationFrame(id)
  }, [])

  const tableColumns: Array<DataTableColumn<SampleRow>> = [
    {
      key: 'timestamp',
      header: 'Time',
      sortable: true,
      sortValue: (r) => r.timestamp,
      render: (r) => <span className="font-mono text-xs text-[var(--text-secondary)]">{r.timestamp}</span>,
    },
    {
      key: 'account',
      header: 'Account',
      sortable: true,
      sortValue: (r) => r.account,
      render: (r) => <span className="font-mono text-xs">{r.account}</span>,
    },
    {
      key: 'risk',
      header: 'Risk',
      sortable: true,
      sortValue: (r) => (r.risk === 'low' ? 1 : r.risk === 'medium' ? 2 : 3),
      render: (r) => <RiskBadge level={r.risk} score={r.score} />,
    },
    {
      key: 'outcome',
      header: 'Outcome',
      sortable: true,
      sortValue: (r) => r.outcome,
      render: (r) => <span className="text-sm">{r.outcome}</span>,
    },
  ]

  function triggerLoadingDemo() {
    setBtnLoading(true)
    setTimeout(() => setBtnLoading(false), 1200)
  }

  return (
    <div className="space-y-12 pb-12">
      {/* Page Header */}
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-[var(--border-subtle)] pb-6">
        <div className="space-y-2 max-w-2xl">
          <div className="text-xs font-mono uppercase tracking-wider text-[var(--text-muted)]">
            Design System · v1.0
          </div>
          <h1 className="text-[32px] font-semibold tracking-tight text-[var(--text-primary)] leading-tight">
            SecureReset UI Styleguide
          </h1>
          <p className="text-base text-[var(--text-secondary)] leading-normal">
            Calm, accessible primitives designed for high-trust authentication, recovery
            verification, and security operations.
          </p>
        </div>

        <div className="flex flex-col items-start md:items-end gap-2">
          <span className="text-xs font-medium text-[var(--text-muted)]">Theme Preview</span>
          <ThemeModeSelector />
        </div>
      </header>

      {/* 1. Design Tokens */}
      <section aria-labelledby="tokens-heading" className="space-y-6">
        <div className="space-y-1">
          <h2 id="tokens-heading" className="text-2xl font-semibold tracking-tight">
            1. Design Tokens
          </h2>
          <p className="text-sm text-[var(--text-muted)]">
            Defined in <code className="font-mono text-xs">app/tokens.css</code> on an 8px spacing
            grid with WCAG AA contrast across light and dark modes.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {COLOR_TOKENS.map((t) => (
            <Card key={t.varName} padding="sm" className="space-y-2.5">
              <div
                className="h-12 w-full rounded-[var(--radius-control)] border border-[var(--border-default)]"
                style={{ backgroundColor: `var(${t.varName})` }}
              />
              <div>
                <div className="text-sm font-medium text-[var(--text-primary)]">{t.name}</div>
                <div className="font-mono text-xs text-[var(--text-muted)]">{t.varName}</div>
                <div className="text-xs text-[var(--text-muted)] mt-0.5">{t.role}</div>
              </div>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Typography Scale &amp; Radii</CardTitle>
            <CardDescription>
              Inter sans-serif for interface copy (16px body, 1.5 line-height) and JetBrains Mono
              for OTPs, tokens, IPs, and IDs.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <div className="text-[32px] font-semibold leading-tight">32px · Page Heading</div>
                <div className="text-[24px] font-semibold leading-snug">24px · Section Heading</div>
                <div className="text-[20px] font-semibold leading-snug">20px · Card Title</div>
                <div className="text-[16px] leading-normal">
                  16px · Body copy with 1.5 line height for calm readability.
                </div>
                <div className="text-[14px] text-[var(--text-secondary)]">
                  14px · Form labels, table cells, and secondary actions.
                </div>
                <div className="text-[12px] text-[var(--text-muted)]">
                  12px · Helper text, timestamps, and metadata badges.
                </div>
              </div>
              <div className="space-y-3 rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--bg-surface-subtle)] p-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  Monospace &amp; Geometry
                </div>
                <div className="font-mono text-sm text-[var(--text-primary)]">
                  Token: sr_tok_9f83a2c1e0b4 · OTP: 482910
                </div>
                <div className="text-xs text-[var(--text-secondary)] space-y-1">
                  <div>Controls (inputs, buttons): 8px radius (--radius-control)</div>
                  <div>Cards &amp; modals: 12px radius (--radius-card)</div>
                  <div>Motion: 150ms–200ms with prefers-reduced-motion support</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* 2. Buttons */}
      <section aria-labelledby="buttons-heading" className="space-y-4">
        <h2 id="buttons-heading" className="text-2xl font-semibold tracking-tight">
          2. Buttons
        </h2>
        <Card>
          <CardContent className="pt-0 space-y-6">
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="primary" rightIcon={<ArrowRight className="h-4 w-4" />}>
                Primary action
              </Button>
              <Button variant="secondary">Secondary action</Button>
              <Button variant="danger" leftIcon={<ShieldAlert className="h-4 w-4" />}>
                Cancel reset
              </Button>
              <Button variant="ghost">Ghost action</Button>
              <Button
                variant="primary"
                loading={btnLoading}
                loadingText="Verifying..."
                onClick={triggerLoadingDemo}
              >
                Click for loading state
              </Button>
              <Button variant="secondary" disabled>
                Disabled
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-[var(--border-subtle)]">
              <Button size="sm" variant="secondary">
                Small (sm)
              </Button>
              <Button size="md" variant="secondary">
                Medium (md)
              </Button>
              <Button size="lg" variant="secondary">
                Large (lg)
              </Button>
              <CopyButton value="SR-REC-8912-XK94" label="Copy recovery ID" />
            </div>
          </CardContent>
        </Card>
      </section>

      {/* 3. Form Inputs */}
      <section aria-labelledby="inputs-heading" className="space-y-4">
        <h2 id="inputs-heading" className="text-2xl font-semibold tracking-tight">
          3. Form Inputs
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="space-y-5">
            <CardHeader>
              <CardTitle>Text &amp; Password Inputs</CardTitle>
              <CardDescription>
                Visible labels, helper text, inline errors, show/hide toggle, and live strength meter.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <TextInput
                label="Email address"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                leftAdornment={<Mail className="h-4 w-4" />}
                helperText="We'll never share your email or reveal if an account exists."
              />

              <TextInput
                label="Email with inline error"
                type="email"
                value={invalidEmail}
                onChange={(e) => setInvalidEmail(e.target.value)}
                error="Enter a valid email address (for example, name@domain.com)."
              />

              <PasswordInput
                label="New password (strong)"
                value={passwordStrong}
                onChange={(e) => setPasswordStrong(e.target.value)}
                showStrengthMeter
                strengthInfo={{
                  score: 4,
                  acceptable: true,
                  cracksDisplay: 'centuries',
                  breached: false,
                }}
              />

              <PasswordInput
                label="New password (breached warning)"
                value={passwordWeak}
                onChange={(e) => setPasswordWeak(e.target.value)}
                showStrengthMeter
                strengthInfo={{
                  score: 1,
                  acceptable: false,
                  cracksDisplay: 'less than a second',
                  breached: true,
                  breachCount: 9545824,
                  feedback: ['Add more uncommon words so your passphrase is harder to guess.'],
                }}
              />
            </CardContent>
          </Card>

          <Card className="space-y-5">
            <CardHeader>
              <CardTitle>6-Box OTP Input</CardTitle>
              <CardDescription>
                Auto-advance, paste support, arrow navigation, numeric keypad, and{' '}
                <code className="font-mono text-xs">autocomplete=&quot;one-time-code&quot;</code>.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <OtpInput
                label="Verification code"
                value={otpValue}
                onChange={setOtpValue}
                helperText="Enter the 6-digit code sent to your email. Try pasting 123456."
                labelAction={
                  <span className="font-mono text-xs text-[var(--text-muted)]">4 attempts left</span>
                }
              />

              <OtpInput
                label="Code with inline error"
                value={otpErrorValue}
                onChange={setOtpErrorValue}
                error="That code didn't match. Check your latest email and try again."
              />

              <TextInput
                label="Recovery code (monospace)"
                mono
                defaultValue="ABCD-EFGH-1234-5678"
                leftAdornment={<KeyRound className="h-4 w-4" />}
                helperText="One-time backup code from your security settings."
              />
            </CardContent>
          </Card>
        </div>
      </section>

      {/* 4. Alerts, Badges & Toasts */}
      <section aria-labelledby="feedback-heading" className="space-y-4">
        <h2 id="feedback-heading" className="text-2xl font-semibold tracking-tight">
          4. Alerts, Badges &amp; Toasts
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="space-y-4">
            <CardHeader>
              <CardTitle>Alerts &amp; Banners</CardTitle>
              <CardDescription>Semantic banners paired with icons and accessible live regions.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Alert variant="info" title="Extra protection active">
                Sensitive settings are temporarily paused until your cooling-off window ends.
              </Alert>
              <Alert variant="success" title="Password updated">
                All other active sessions have been signed out.
              </Alert>
              {!alertDismissed && (
                <Alert
                  variant="warning"
                  title="Unfamiliar browser"
                  onDismiss={() => setAlertDismissed(true)}
                >
                  A waiting period applies because we don&apos;t recognize this browser yet.
                </Alert>
              )}
              <Alert variant="danger" title="Reset request blocked">
                Too many incorrect verification codes. Please wait before trying again.
              </Alert>
            </CardContent>
          </Card>

          <Card className="space-y-5">
            <CardHeader>
              <CardTitle>Badges &amp; Toast Notifications</CardTitle>
              <CardDescription>
                Color is always paired with an icon and clear text label.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  Risk Scale
                </div>
                <div className="flex flex-wrap gap-2">
                  <RiskBadge level="low" score={85} />
                  <RiskBadge level="medium" score={48} />
                  <RiskBadge level="high" score={12} />
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  Status Badges
                </div>
                <div className="flex flex-wrap gap-2">
                  <StatusBadge variant="neutral" label="Pending" />
                  <StatusBadge variant="info" label="This device" />
                  <StatusBadge variant="success" label="Verified" />
                  <StatusBadge variant="warning" label="Cooling off" />
                  <StatusBadge variant="danger" label="Vetoed" />
                </div>
              </div>

              <div className="space-y-2 pt-2 border-t border-[var(--border-subtle)]">
                <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  Toast Triggers
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      toast({
                        variant: 'info',
                        title: 'Instructions sent',
                        description: 'Check your inbox if an account exists.',
                      })
                    }
                  >
                    Info toast
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      toast({
                        variant: 'success',
                        title: 'Trusted device added',
                        description: 'This browser can now approve future resets faster.',
                      })
                    }
                  >
                    Success toast
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      toast({
                        variant: 'warning',
                        title: 'Probation active',
                        description: 'Some account changes unlock in 48 hours.',
                      })
                    }
                  >
                    Warning toast
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      toast({
                        variant: 'danger',
                        title: 'Request cancelled',
                        description: 'All reset links have been invalidated.',
                      })
                    }
                  >
                    Danger toast
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* 5. Steps, Countdowns & Disclosures */}
      <section aria-labelledby="flows-heading" className="space-y-4">
        <h2 id="flows-heading" className="text-2xl font-semibold tracking-tight">
          5. Step Indicator, Countdown Timer &amp; Explainer
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="space-y-5">
            <CardHeader>
              <CardTitle>Step Indicators</CardTitle>
              <CardDescription>Horizontal recovery stepper and vertical cooling-off timeline.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <StepIndicator
                currentStep={1}
                steps={[
                  { id: 'request', label: 'Request' },
                  { id: 'verify', label: 'Verify' },
                  { id: 'check', label: 'Secure check' },
                  { id: 'password', label: 'New password' },
                ]}
              />

              <div className="pt-4 border-t border-[var(--border-subtle)]">
                <StepIndicator
                  orientation="vertical"
                  currentStep={2}
                  steps={[
                    { id: 'received', label: 'Request received', description: 'Today at 08:40 AM' },
                    { id: 'verified', label: 'Email verified', description: '6-digit code confirmed' },
                    {
                      id: 'waiting',
                      label: 'Waiting period',
                      description: 'Protects your account if someone else requested this',
                    },
                    { id: 'ready', label: 'Ready to set password' },
                  ]}
                />
              </div>
            </CardContent>
          </Card>

          <Card className="space-y-5">
            <CardHeader>
              <CardTitle>Countdown Timers &amp; Security Explainer</CardTitle>
              <CardDescription>Inline resend cooldown, linear progress, and circular cooling-off ring.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <CountdownTimer variant="inline" label="Resend available in" secondsRemaining={45} />
                <CountdownTimer variant="inline" label="Rate limit resets in" secondsRemaining={272} />
              </div>

              <CountdownTimer
                variant="linear"
                label="Probation period"
                secondsRemaining={48 * 3600}
                totalSeconds={72 * 3600}
                showCompletionTime
              />

              <div className="flex justify-center pt-2">
                <CountdownTimer
                  variant="circular"
                  label="Waiting period"
                  targetTime={coolingTarget}
                  totalSeconds={24 * 3600}
                  showCompletionTime
                />
              </div>

              <ExpandableExplainer title="Why am I waiting?">
                <ul className="list-disc list-inside space-y-1">
                  <li>We don&apos;t recognize this browser yet.</li>
                  <li>This waiting period gives you time to cancel if you didn&apos;t make this request.</li>
                </ul>
              </ExpandableExplainer>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* 6. Modal, Data Table & Skeleton */}
      <section aria-labelledby="data-heading" className="space-y-4">
        <h2 id="data-heading" className="text-2xl font-semibold tracking-tight">
          6. Modal, Data Table &amp; Skeleton Loaders
        </h2>

        <Card>
          <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle>Sortable Data Table &amp; States</CardTitle>
              <CardDescription>Supports keyboard sorting, row clicks, loading skeletons, and empty state.</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                leftIcon={<RefreshCw className="h-3.5 w-3.5" />}
                onClick={() => setTableLoading((v) => !v)}
              >
                {tableLoading ? 'Show data' : 'Toggle loading'}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setTableEmpty((v) => !v)}
              >
                {tableEmpty ? 'Restore rows' : 'Toggle empty'}
              </Button>
              <Button
                size="sm"
                variant="primary"
                leftIcon={<Lock className="h-3.5 w-3.5" />}
                onClick={() => setModalOpen(true)}
              >
                Open modal
              </Button>
            </div>
          </CardHeader>

          <CardContent className="space-y-6">
            <DataTable
              caption="Sample security events"
              columns={tableColumns}
              data={tableEmpty ? [] : SAMPLE_ROWS}
              getRowKey={(r) => r.id}
              loading={tableLoading}
              onRowClick={(row) =>
                toast({
                  variant: 'info',
                  title: `Selected ${row.account}`,
                  description: `Outcome: ${row.outcome}`,
                })
              }
              emptyTitle="No security events yet"
              emptyDescription="When reset requests occur, they will appear here with their outcome."
              emptyAction={
                <Button size="sm" variant="secondary" onClick={() => setTableEmpty(false)}>
                  Reset filter
                </Button>
              }
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <SkeletonCard />
              <Card className="space-y-3">
                <div className="text-sm font-medium text-[var(--text-primary)]">Inline Skeleton Primitives</div>
                <Skeleton className="h-6 w-1/2" />
                <SkeletonText lines={3} />
              </Card>
            </div>
          </CardContent>

          <CardFooter>
            <span className="text-xs text-[var(--text-muted)]">
              All interactive components are keyboard navigable and respect reduced motion.
            </span>
          </CardFooter>
        </Card>
      </section>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Cancel this reset request?"
        description="Cancelling immediately invalidates the verification link and code."
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Keep waiting
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setModalOpen(false)
                toast({
                  variant: 'success',
                  title: 'Reset request cancelled',
                  description: 'No password changes were made.',
                })
              }}
            >
              Cancel request
            </Button>
          </>
        }
      >
        <p className="text-[var(--text-secondary)]">
          If you didn&apos;t start this password reset, cancelling it ensures no one can use the
          existing link or verification code.
        </p>
      </Modal>
    </div>
  )
}
