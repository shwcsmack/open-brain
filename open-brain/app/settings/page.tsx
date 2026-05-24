'use client'
import { useState, useCallback } from 'react'
import Link from 'next/link'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NoteMarkdownEditor } from '@/components/editor/NoteMarkdownEditor'
import { toast } from 'sonner'

type PeriodType = 'DAY' | 'WEEK' | 'MONTH' | 'QUARTER' | 'YEAR'

const PERIOD_LABELS: Record<PeriodType, string> = {
  DAY: 'Daily',
  WEEK: 'Weekly',
  MONTH: 'Monthly',
  QUARTER: 'Quarterly',
  YEAR: 'Yearly',
}

const PERIOD_TYPES: PeriodType[] = ['DAY', 'WEEK', 'MONTH', 'QUARTER', 'YEAR']

// Templates predating the markdown migration were persisted as TipTap JSON
// (e.g. `{"type":"doc","content":[...]}`). Render those as empty markdown so
// users start from a clean slate rather than seeing raw JSON in the editor.
function normalizeTemplateBody(stored: string | null | undefined): string {
  if (!stored) return ''
  const trimmed = stored.trim()
  if (trimmed === '' || trimmed === '{}') return ''
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed)
      if (parsed && typeof parsed === 'object' && parsed.type === 'doc') {
        return ''
      }
    } catch {
      // not JSON — fall through and treat as markdown
    }
  }
  return stored
}

function TemplateEditor({ periodType }: { periodType: PeriodType }) {
  const { data: template, isLoading } = trpc.periodicTemplate.get.useQuery(periodType)
  const upsert = trpc.periodicTemplate.upsert.useMutation({
    onSuccess: () => toast.success(`${PERIOD_LABELS[periodType]} template saved`),
    onError: () => toast.error('Failed to save template'),
  })

  const [currentContent, setCurrentContent] = useState<string | null>(null)

  const initialContent = normalizeTemplateBody(template?.content)
  const value = currentContent ?? initialContent

  const handleSave = useCallback(() => {
    upsert.mutate({ periodType, content: value })
  }, [periodType, upsert, value])

  if (isLoading) {
    return <div className="h-32 bg-muted animate-pulse rounded" />
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="p-3 min-h-[8rem]">
        <NoteMarkdownEditor
          value={value}
          onChange={setCurrentContent}
          placeholder="Write a markdown template…"
        />
      </div>
      <div className="border-t px-3 py-2 flex justify-end bg-muted/30">
        <Button
          size="sm"
          onClick={handleSave}
          disabled={upsert.isPending}
        >
          {upsert.isPending ? 'Saving...' : 'Save'}
        </Button>
      </div>
    </div>
  )
}

function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const changePassword = trpc.auth.changePassword.useMutation({
    onSuccess: () => {
      toast.success('Password updated')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    },
    onError: err => toast.error(err.message),
  })

  const handleSubmit = useCallback(() => {
    if (newPassword.length < 8) {
      toast.error('New password must be at least 8 characters')
      return
    }
    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match')
      return
    }
    changePassword.mutate({ currentPassword, newPassword })
  }, [currentPassword, newPassword, confirmPassword, changePassword])

  const canSubmit =
    currentPassword.length > 0 &&
    newPassword.length >= 8 &&
    newPassword === confirmPassword &&
    !changePassword.isPending

  return (
    <div className="border rounded-lg p-4 space-y-3 max-w-md">
      <div className="space-y-1">
        <label htmlFor="current-password" className="text-sm font-medium">Current password</label>
        <Input
          id="current-password"
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={e => setCurrentPassword(e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <label htmlFor="new-password" className="text-sm font-medium">New password</label>
        <Input
          id="new-password"
          type="password"
          autoComplete="new-password"
          placeholder="At least 8 characters"
          value={newPassword}
          onChange={e => setNewPassword(e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <label htmlFor="confirm-password" className="text-sm font-medium">Confirm new password</label>
        <Input
          id="confirm-password"
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={e => setConfirmPassword(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && canSubmit && handleSubmit()}
        />
        {confirmPassword.length > 0 && newPassword !== confirmPassword && (
          <p className="text-destructive text-xs">Passwords don&apos;t match</p>
        )}
      </div>
      <div className="flex justify-end">
        <Button onClick={handleSubmit} disabled={!canSubmit}>
          {changePassword.isPending ? 'Updating...' : 'Change password'}
        </Button>
      </div>
    </div>
  )
}

export default function SettingsPage() {
  return (
    <div className="flex min-h-screen">
      <aside className="hidden lg:flex w-56 shrink-0 border-r p-4 flex-col gap-4">
        <nav className="flex flex-col gap-1">
          <Link href="/" className="text-sm font-medium px-2 py-1.5 rounded hover:bg-accent">Notes</Link>
          <Link href="/tasks" className="text-sm font-medium px-2 py-1.5 rounded hover:bg-accent">Tasks</Link>
          <Link href="/graph" className="text-sm font-medium px-2 py-1.5 rounded hover:bg-accent">Graph</Link>
          <Link href="/decks" className="text-sm font-medium px-2 py-1.5 rounded hover:bg-accent">Decks</Link>
          <Link href="/review" className="text-sm font-medium px-2 py-1.5 rounded hover:bg-accent">Review</Link>
          <Link href="/reading" className="text-sm font-medium px-2 py-1.5 rounded hover:bg-accent">Reading</Link>
          <Link href="/settings" className="text-sm font-medium px-2 py-1.5 rounded hover:bg-accent bg-accent">Settings</Link>
        </nav>
      </aside>
      <main className="flex-1 p-6 max-w-3xl">
      <h1 className="text-2xl font-bold mb-2">Settings</h1>
      <p className="text-muted-foreground mb-8">Manage your account and configure periodic note templates.</p>

      <section className="mb-10">
        <h2 className="text-lg font-semibold mb-2">Account</h2>
        <p className="text-sm text-muted-foreground mb-3">
          Change the password used to sign in to open-brain.
        </p>
        <ChangePasswordForm />
      </section>

      <div className="space-y-8">
        {PERIOD_TYPES.map(periodType => (
          <section key={periodType}>
            <h2 className="text-lg font-semibold mb-2">{PERIOD_LABELS[periodType]} Template</h2>
            <p className="text-sm text-muted-foreground mb-3">
              Used when creating a new {PERIOD_LABELS[periodType].toLowerCase()} note.
            </p>
            <TemplateEditor periodType={periodType} />
          </section>
        ))}
      </div>
      </main>
    </div>
  )
}
