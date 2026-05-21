'use client'
import { useState, useCallback } from 'react'
import Link from 'next/link'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
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

const EMPTY_DOC = JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }] })

function safeParseJSON(s: string, fallback: string) {
  try { return JSON.parse(s) } catch { return JSON.parse(fallback) }
}

function TemplateEditor({ periodType }: { periodType: PeriodType }) {
  const { data: template, isLoading } = trpc.periodicTemplate.get.useQuery(periodType)
  const upsert = trpc.periodicTemplate.upsert.useMutation({
    onSuccess: () => toast.success(`${PERIOD_LABELS[periodType]} template saved`),
    onError: () => toast.error('Failed to save template'),
  })

  const [currentContent, setCurrentContent] = useState<string | null>(null)

  const initialContent = template?.content && template.content !== '{}'
    ? template.content
    : EMPTY_DOC

  const editor = useEditor({
    extensions: [StarterKit],
    content: isLoading ? '' : safeParseJSON(currentContent ?? initialContent, EMPTY_DOC),
    onUpdate: ({ editor }) => {
      setCurrentContent(JSON.stringify(editor.getJSON()))
    },
  }, [isLoading])

  const handleSave = useCallback(() => {
    const content = currentContent ?? initialContent
    upsert.mutate({ periodType, content })
  }, [currentContent, initialContent, periodType, upsert])

  if (isLoading) {
    return <div className="h-32 bg-muted animate-pulse rounded" />
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="prose prose-sm max-w-none p-3 min-h-[8rem]">
        <EditorContent editor={editor} />
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
          <Link href="/settings" className="text-sm font-medium px-2 py-1.5 rounded hover:bg-accent bg-accent">Settings</Link>
        </nav>
      </aside>
      <main className="flex-1 p-6 max-w-3xl">
      <h1 className="text-2xl font-bold mb-2">Settings</h1>
      <p className="text-muted-foreground mb-8">Configure periodic note templates. These templates are used when a new periodic note is created.</p>

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
