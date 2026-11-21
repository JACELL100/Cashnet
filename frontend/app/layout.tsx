import type { Metadata } from 'next'
import { Chakra_Petch, IBM_Plex_Mono, DM_Sans } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import Providers from './providers'
import { Web3Provider } from '@/components/Web3Provider'
import VoiceAgentWrapper from '@/components/VoiceAgentWrapper'
import './globals.css'

const chakraPetch = Chakra_Petch({ 
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: '--font-heading'
});

const ibmPlexMono = IBM_Plex_Mono({ 
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: '--font-mono'
});

const dmSans = DM_Sans({ 
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: '--font-sans'
});

export const metadata: Metadata = {
  title: 'cashnet Simulation Lab',
  description: 'Institutional DeFi Risk Simulation Platform',
  generator: 'dotlocal',
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }],
  },
  manifest: '/manifest.webmanifest',

}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${chakraPetch.variable} ${ibmPlexMono.variable} ${dmSans.variable}`}>
      <body className="font-sans antialiased">
        <Providers>
          <Web3Provider>
            {children}
            <VoiceAgentWrapper />
          </Web3Provider>
        </Providers>
        <Analytics />
      </body>
    </html>
  )
}
