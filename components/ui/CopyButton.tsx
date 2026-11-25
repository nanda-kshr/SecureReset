'use client'

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { Button, ButtonSize, ButtonVariant } from './Button'

export interface CopyButtonProps {
  value: string
  label?: string
  copiedLabel?: string
  variant?: ButtonVariant
  size?: ButtonSize
  className?: string
}

export function CopyButton({
  value,
  label = 'Copy',
  copiedLabel = 'Copied',
  variant = 'secondary',
  size = 'sm',
  className = '',
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard API unavailable
    }
  }

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      onClick={handleCopy}
      aria-label={copied ? copiedLabel : label}
      leftIcon={
        copied ? (
          <Check className="h-3.5 w-3.5 text-[var(--success-text)]" aria-hidden="true" />
        ) : (
          <Copy className="h-3.5 w-3.5" aria-hidden="true" />
        )
      }
      className={className}
    >
      <span aria-live="polite">{copied ? copiedLabel : label}</span>
    </Button>
  )
}
