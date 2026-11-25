import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
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

export const metadata: Metadata = {
  title: 'SecureReset — Hardened Password Reset & Security Operations',
  description:
    'Capstone web app demonstrating multi-layered password reset security: 256-bit device-bound tokens, OTP, risk scoring, TOTP, HIBP checks, audit logs, and attack simulation.',
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased dark`}
    >
      <body className="min-h-full flex flex-col bg-slate-950 text-slate-100">
        <Navbar />
        <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-8">{children}</main>
        <footer className="border-t border-slate-800/80 py-5 text-center text-xs text-slate-500">
          SecureReset Capstone Project · Multi-Layered Password Reset &amp; SOC Telemetry
        </footer>
      </body>
    </html>
  )
}
