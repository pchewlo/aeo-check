import type { Metadata } from 'next'
import Nav from '../components/Nav'

export const metadata: Metadata = {
  metadataBase: new URL('https://acme.test'),
  title: { default: 'Acme analytics', template: '%s | Acme' },
  description: 'Retention reports for product teams.',
}

const org = { '@context': 'https://schema.org', '@type': 'Organization', name: 'Acme', url: 'https://acme.test' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <body>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(org) }} />
        <Nav />
        {children}
      </body>
    </html>
  )
}
