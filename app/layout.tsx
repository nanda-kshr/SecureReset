import type { Metadata } from 'next'
import { Geist, Geist_Mono, Newsreader } from 'next/font/google'
import './globals.css'
import { Navbar } from '@/components/Navbar'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

const newsreader = Newsreader({
  variable: '--font-newsreader',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
})

export const metadata: Metadata = {
  title: 'SecureReset — Hardened Password Reset & Security Operations',
  description:
    'Capstone web application demonstrating multi-layered password reset security: 256-bit device-bound tokens, OTP, adaptive risk scoring, TOTP, HIBP checks, audit logs, and attack simulation.',
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${newsreader.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[#F9F9F8] text-zinc-950 selection:bg-zinc-900 selection:text-white">
        <Navbar />
        <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-8 py-10">{children}</main>
        <footer className="border-t border-zinc-200 bg-white py-6">
          <div className="max-w-6xl mx-auto px-4 sm:px-8 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-zinc-500">
            <span>SecureReset · Multi-Layered Password Reset Architecture</span>
            <span className="font-mono">SHA-256 · bcrypt · RFC 6238 TOTP · HIBP k-Anonymity</span>
          </div>
        </footer>
      </body>
    </html>
  )
}
