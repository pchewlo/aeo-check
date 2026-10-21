'use client'
import { useEffect, useState } from 'react'

export default function Pricing() {
  const [plans, setPlans] = useState<{ name: string; price: string }[]>([])
  useEffect(() => {
    fetch('/api/plans').then((r) => r.json()).then(setPlans)
  }, [])
  return (
    <main>
      <h1>Pricing</h1>
      {plans.map((p) => (
        <div key={p.name}>{p.name}: {p.price}</div>
      ))}
    </main>
  )
}
