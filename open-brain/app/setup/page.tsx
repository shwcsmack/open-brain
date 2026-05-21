'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default function SetupPage() {
  const [password, setPassword] = useState('')
  const router = useRouter()
  const { data: hasUser } = trpc.auth.hasUser.useQuery()
  const setup = trpc.auth.setup.useMutation({ onSuccess: () => router.push('/') })

  useEffect(() => {
    if (hasUser) router.replace('/login')
  }, [hasUser, router])

  if (hasUser === undefined) return null // loading

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-sm space-y-4 p-6">
        <h1 className="text-2xl font-bold">Welcome to open-brain</h1>
        <p className="text-muted-foreground">Set your password to get started.</p>
        <Input
          type="password"
          placeholder="Choose a password (min 8 chars)"
          value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && setup.mutate({ password })}
        />
        <Button className="w-full" onClick={() => setup.mutate({ password })} disabled={setup.isPending}>
          {setup.isPending ? 'Setting up...' : 'Create account'}
        </Button>
        {setup.error && <p className="text-destructive text-sm">{setup.error.message}</p>}
      </div>
    </div>
  )
}
