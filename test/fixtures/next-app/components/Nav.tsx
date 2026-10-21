'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function Nav() {
  const router = useRouter()
  return (
    <nav>
      <Link href="/">Acme</Link>
      <span onClick={() => router.push('/pricing')}>Pricing</span>
    </nav>
  )
}
