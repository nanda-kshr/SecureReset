import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import {
  Button,
  DataTable,
  Modal,
  OtpInput,
  PasswordInput,
  RiskBadge,
  StatusBadge,
  TextInput,
  ThemeProvider,
  ThemeToggle,
} from '@/components/ui'
import StyleguidePage from '@/app/styleguide/page'

describe('Design System Components', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    })
  })

  it('renders Button loading state with aria-busy and disabled attribute', () => {
    render(
      <Button loading loadingText="Saving...">
        Save
      </Button>
    )
    const btn = screen.getByRole('button', { name: /Saving.../i })
    expect(btn).toBeDisabled()
    expect(btn).toHaveAttribute('aria-busy', 'true')
  })

  it('links TextInput label, helper text, and inline error via aria attributes', () => {
    const { rerender } = render(
      <TextInput label="Email address" helperText="Enter your work email." />
    )
    const input = screen.getByLabelText(/Email address/i)
    expect(input).toHaveAttribute('aria-describedby')
    expect(screen.getByText('Enter your work email.')).toBeInTheDocument()

    rerender(<TextInput label="Email address" error="Email is invalid." />)
    expect(screen.getByRole('alert')).toHaveTextContent('Email is invalid.')
    expect(input).toHaveAttribute('aria-invalid', 'true')
  })

  it('toggles PasswordInput visibility and displays strength checklist', () => {
    render(
      <PasswordInput
        label="New password"
        value="correct-horse-battery-92"
        onChange={() => {}}
        showStrengthMeter
        strengthInfo={{
          score: 4,
          acceptable: true,
          cracksDisplay: 'centuries',
          breached: false,
        }}
      />
    )
    const input = screen.getByLabelText('New password')
    expect(input).toHaveAttribute('type', 'password')

    const toggle = screen.getByRole('button', { name: /Show password/i })
    fireEvent.click(toggle)
    expect(input).toHaveAttribute('type', 'text')
    expect(screen.getByRole('button', { name: /Hide password/i })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    expect(screen.getByText(/Not in known breaches/i)).toBeInTheDocument()
    expect(screen.getByText(/At least 10 characters/i)).toBeInTheDocument()
  })

  it('supports auto-advance and paste in 6-box OtpInput', () => {
    const onChange = vi.fn()
    const onComplete = vi.fn()
    render(<OtpInput label="Code" value="" onChange={onChange} onComplete={onComplete} />)

    const box1 = screen.getByLabelText('Digit 1 of 6')
    const box2 = screen.getByLabelText('Digit 2 of 6')
    expect(box1).toHaveAttribute('autocomplete', 'one-time-code')
    expect(box1).toHaveAttribute('inputmode', 'numeric')

    fireEvent.change(box1, { target: { value: '5' } })
    expect(onChange).toHaveBeenCalledWith('5')
    expect(document.activeElement).toBe(box2)

    fireEvent.paste(box1, {
      clipboardData: { getData: () => '482-910' },
    })
    expect(onChange).toHaveBeenCalledWith('482910')
    expect(onComplete).toHaveBeenCalledWith('482910')
  })

  it('renders RiskBadge and StatusBadge with explicit labels', () => {
    render(
      <div>
        <RiskBadge level="low" score={90} />
        <RiskBadge level="medium" />
        <RiskBadge level="high" />
        <StatusBadge variant="warning" label="Cooling off" />
      </div>
    )
    expect(screen.getByText('Low risk')).toBeInTheDocument()
    expect(screen.getByText('Medium risk')).toBeInTheDocument()
    expect(screen.getByText('High risk')).toBeInTheDocument()
    expect(screen.getByText('Cooling off')).toBeInTheDocument()
  })

  it('sorts DataTable rows and renders empty state', () => {
    type Row = { id: string; name: string }
    const rows: Row[] = [
      { id: '1', name: 'Bravo' },
      { id: '2', name: 'Alpha' },
    ]
    const columns = [
      {
        key: 'name',
        header: 'Name',
        sortable: true,
        sortValue: (r: Row) => r.name,
        render: (r: Row) => r.name,
      },
    ]

    const { rerender } = render(
      <DataTable columns={columns} data={rows} getRowKey={(r) => r.id} />
    )
    const sortBtn = screen.getByRole('button', { name: /Name/i })
    fireEvent.click(sortBtn)

    const cells = screen.getAllByRole('cell')
    expect(cells[0]).toHaveTextContent('Alpha')
    expect(cells[1]).toHaveTextContent('Bravo')

    rerender(
      <DataTable
        columns={columns}
        data={[]}
        getRowKey={(r) => r.id}
        emptyTitle="No data available"
      />
    )
    expect(screen.getByText('No data available')).toBeInTheDocument()
  })

  it('closes Modal on Escape key', () => {
    const onClose = vi.fn()
    render(
      <Modal open onClose={onClose} title="Confirm action">
        Are you sure?
      </Modal>
    )
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('toggles manual light/dark theme via ThemeToggle', () => {
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>
    )
    const btn = screen.getByRole('button', { name: /Switch to dark theme/i })
    fireEvent.click(btn)
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')

    fireEvent.click(screen.getByRole('button', { name: /Switch to light theme/i }))
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })

  it('renders /styleguide page with all core sections', () => {
    render(
      <ThemeProvider>
        <StyleguidePage />
      </ThemeProvider>
    )
    expect(
      screen.getByRole('heading', { level: 1, name: /SecureReset UI Styleguide/i })
    ).toBeInTheDocument()
    expect(screen.getByText(/1. Design Tokens/i)).toBeInTheDocument()
    expect(screen.getByText(/2. Buttons/i)).toBeInTheDocument()
    expect(screen.getByText(/3. Form Inputs/i)).toBeInTheDocument()
  })
})
