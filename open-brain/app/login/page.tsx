'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default function LoginPage() {
  const [password, setPassword] = useState('')
  const router = useRouter()
  const login = trpc.auth.login.useMutation({ onSuccess: () => router.push('/') })

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-sm space-y-4 p-6">
        <h1 className="text-2xl font-bold">open-brain</h1>
        <Input
          type="password"
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && login.mutate({ password })}
        />
        <Button className="w-full" onClick={() => login.mutate({ password })} disabled={login.isPending}>
          {login.isPending ? 'Signing in...' : 'Sign in'}
        </Button>
        {login.error && <p className="text-destructive text-sm">Invalid password</p>}
      </div>
    </div>
  )
}
