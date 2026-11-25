import type { Metadata } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import './globals.css'
import { Navbar } from '@/components/Navbar'
import { ThemeProvider, ToastProvider } from '@/components/ui'

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
})

const jetbrainsMono = JetBrains_Mono({
  variable: '--font-jetbrains-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'SecureReset — Account Recovery & Security Operations',
  description:
    'Multi-layered password reset security with device-bound verification, adaptive assurance checks, cooling-off protection, and security telemetry.',
}

const THEME_INIT_SCRIPT = `
(function(){
  try {
    var t = localStorage.getItem('sr_theme');
    if (t === 'light' || t === 'dark') {
      document.documentElement.setAttribute('data-theme', t);
    }
  } catch (e) {}
})();
`

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col bg-[var(--bg-canvas)] text-[var(--text-primary)] selection:bg-[var(--primary)] selection:text-[var(--primary-fg)]">
        <ThemeProvider>
          <ToastProvider>
            <Navbar />
            <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-8 py-8 sm:py-10">
              {children}
            </main>
            <footer className="border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] py-6">
              <div className="max-w-6xl mx-auto px-4 sm:px-8 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-[var(--text-muted)]">
                <span>SecureReset · Multi-Layered Account Recovery</span>
                <span className="font-mono">SHA-256 · bcrypt · RFC 6238 TOTP · HIBP k-Anonymity</span>
              </div>
            </footer>
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
