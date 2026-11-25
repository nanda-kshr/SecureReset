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
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3.5 space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-amber-300">
          Security CAPTCHA Required
        </span>
        <button
          type="button"
          onClick={onRefresh}
          className="inline-flex items-center gap-1 text-xs text-slate-300 hover:text-white cursor-pointer"
        >
          <RefreshCw className="h-3 w-3" />
          New code
        </button>
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div
          className="rounded-md overflow-hidden border border-slate-700"
          dangerouslySetInnerHTML={{ __html: captcha.svg }}
        />
        <input
          type="text"
          value={answer}
          onChange={(e) => onAnswerChange(e.target.value)}
          placeholder="Type 5 characters"
          aria-label="CAPTCHA answer"
          required
          className="w-full sm:w-44 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm uppercase tracking-widest text-slate-100 placeholder-slate-500 focus:border-amber-400 focus:outline-none"
        />
      </div>
    </div>
  )
}
