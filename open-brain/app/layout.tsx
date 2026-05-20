import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'
import { validateEnv } from '@/lib/startup'
import { seedInitialUserIfNeeded } from '@/lib/seed-user'

validateEnv()

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Open Brain',
  description: 'Self-hostable personal knowledge management',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  await seedInitialUserIfNeeded()

  return (
    <html lang="en">
      <body className={inter.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
