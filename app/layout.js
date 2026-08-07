import './globals.css'
import { Providers } from './providers'

export const metadata = {
  title: 'LOOP — Customer feedback intelligence',
  description: 'Turn scattered customer feedback into a ranked, evidence-backed list of what to do next.',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body><Providers>{children}</Providers></body>
    </html>
  )
}
