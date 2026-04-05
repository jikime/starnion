import type { Metadata } from 'next'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getMessages } from 'next-intl/server'
import { SessionProvider } from 'next-auth/react'
import { ThemeProvider } from 'next-themes'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'

export const metadata: Metadata = {
  title: {
    default: 'StarNion AI',
    template: '%s | StarNion AI',
  },
  description: 'AI 기반 개인 생산성 플랫폼 — 플래너, 자산 관리, 채팅, 파일 관리를 하나로',
  keywords: ['StarNion', 'AI', 'Planner', 'Franklin Planner', 'Finance', 'Chat', 'Productivity'],
  authors: [{ name: 'StarNion' }],
  creator: 'StarNion',
  metadataBase: new URL('https://starnion.ai'),
  openGraph: {
    title: 'StarNion AI',
    description: 'AI 기반 개인 생산성 플랫폼 — 플래너, 자산 관리, 채팅, 파일 관리를 하나로',
    type: 'website',
    siteName: 'StarNion AI',
  },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '48x48', type: 'image/x-icon' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/android-chrome-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/android-chrome-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const locale = await getLocale()
  const messages = await getMessages()

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="anonymous" />
        <link rel="preload" as="style" crossOrigin="anonymous"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" />
        <link rel="stylesheet" crossOrigin="anonymous"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" />
      </head>
      <body className="font-sans antialiased bg-background text-foreground">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
          <SessionProvider>
            <NextIntlClientProvider locale={locale} messages={messages}>
              {children}
            </NextIntlClientProvider>
          </SessionProvider>
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  )
}
