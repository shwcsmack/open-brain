'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CalendarNavigator } from '@/components/calendar/CalendarNavigator'
import { formatDistanceToNow } from 'date-fns'

export default function NotesPage() {
  const [tagFilter, setTagFilter] = useState<string | null>(null)
  const router = useRouter()
  const { data: notes } = trpc.note.list.useQuery()
  const create = trpc.note.create.useMutation({
    onSuccess: note => router.push(`/notes/${note.slug}`),
  })

  const filtered = tagFilter
    ? notes?.filter(n => {
        try { return JSON.parse(n.tags).includes(tagFilter) } catch { return false }
      })
    : notes

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="w-56 shrink-0 border-r p-4 flex flex-col gap-4">
        <nav className="flex flex-col gap-1">
          <Link href="/" className="text-sm font-medium px-2 py-1.5 rounded hover:bg-accent">Notes</Link>
          <Link href="/tasks" className="text-sm font-medium px-2 py-1.5 rounded hover:bg-accent">Tasks</Link>
          <Link href="/graph" className="text-sm font-medium px-2 py-1.5 rounded hover:bg-accent">Graph</Link>
          <Link href="/decks" className="text-sm font-medium px-2 py-1.5 rounded hover:bg-accent">Decks</Link>
          <Link href="/review" className="text-sm font-medium px-2 py-1.5 rounded hover:bg-accent">Review</Link>
          <Link href="/settings" className="text-sm font-medium px-2 py-1.5 rounded hover:bg-accent">Settings</Link>
        </nav>
        <div className="border-t pt-4">
          <CalendarNavigator />
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 p-6 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Notes</h1>
        <Button onClick={() => create.mutate({ title: 'Untitled' })} disabled={create.isPending}>
          New note
        </Button>
      </div>
      {tagFilter && (
        <div className="mb-4 flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Filtered by:</span>
          <Badge variant="secondary" className="cursor-pointer" onClick={() => setTagFilter(null)}>
            {tagFilter} ×
          </Badge>
        </div>
      )}
      <div className="space-y-2">
        {filtered?.map(note => {
          let tags: string[] = []
          try { tags = JSON.parse(note.tags) } catch { /* noop */ }
          let excerpt = ''
          try {
            excerpt = JSON.parse(note.body)?.content?.[0]?.content?.[0]?.text?.slice(0, 120) ?? ''
          } catch { /* noop */ }
          return (
            <div
              key={note.id}
              className="p-4 rounded-lg border hover:bg-accent cursor-pointer"
              onClick={() => router.push(`/notes/${note.slug}`)}
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-medium">{note.title}</h3>
                <span className="text-xs text-muted-foreground shrink-0">
                  {formatDistanceToNow(new Date(note.updatedAt), { addSuffix: true })}
                </span>
              </div>
              {excerpt && <p className="text-sm text-muted-foreground mt-1 truncate">{excerpt}</p>}
              {tags.length > 0 && (
                <div className="flex gap-1 mt-2 flex-wrap">
                  {tags.map(tag => (
                    <Badge
                      key={tag}
                      variant="outline"
                      className="text-xs cursor-pointer"
                      onClick={e => { e.stopPropagation(); setTagFilter(tag) }}
                    >
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          )
        })}
        {filtered?.length === 0 && (
          <p className="text-muted-foreground text-sm">No notes yet. Create one above.</p>
        )}
      </div>
      </main>
    </div>
  )
}
