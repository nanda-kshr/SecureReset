'use client'

import { RefreshCw } from 'lucide-react'

export interface CaptchaData {
  captchaToken: string
  svg: string
}

interface CaptchaBoxProps {
  captcha: CaptchaData
  answer: string
  onAnswerChange: (val: string) => void
  onRefresh: () => void
}

export function CaptchaBox({ captcha, answer, onAnswerChange, onRefresh }: CaptchaBoxProps) {
  return (
    <div className="rounded-md border border-amber-300 bg-amber-50/70 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-amber-900">
          Human Verification Required
        </span>
        <button
          type="button"
          onClick={onRefresh}
          className="inline-flex items-center gap-1 text-xs font-medium text-zinc-700 hover:text-zinc-950 cursor-pointer"
        >
          <RefreshCw className="h-3 w-3" />
          Refresh
        </button>
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div
          className="rounded-md overflow-hidden border border-zinc-300"
          dangerouslySetInnerHTML={{ __html: captcha.svg }}
        />
        <input
          type="text"
          value={answer}
          onChange={(e) => onAnswerChange(e.target.value)}
          placeholder="Enter 5 characters"
          aria-label="CAPTCHA answer"
          required
          className="w-full sm:w-44 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-mono uppercase tracking-widest text-zinc-950 placeholder-zinc-400 focus:border-zinc-900 focus:outline-none"
        />
      </div>
    </div>
  )
}
