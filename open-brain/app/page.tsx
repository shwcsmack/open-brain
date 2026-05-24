'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { CalendarNavigator } from '@/components/calendar/CalendarNavigator'
import { stripMarkdown } from '@/lib/stripMarkdown'
import { formatDistanceToNow } from 'date-fns'
import { X } from 'lucide-react'

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-1">
      <Link href="/" className="text-sm font-medium px-2 py-1.5 rounded hover:bg-accent bg-accent" onClick={onNavigate}>Notes</Link>
      <Link href="/tasks" className="text-sm font-medium px-2 py-1.5 rounded hover:bg-accent" onClick={onNavigate}>Tasks</Link>
      <Link href="/graph" className="text-sm font-medium px-2 py-1.5 rounded hover:bg-accent" onClick={onNavigate}>Graph</Link>
      <Link href="/decks" className="text-sm font-medium px-2 py-1.5 rounded hover:bg-accent" onClick={onNavigate}>Decks</Link>
      <Link href="/review" className="text-sm font-medium px-2 py-1.5 rounded hover:bg-accent" onClick={onNavigate}>Review</Link>
      <Link href="/reading" className="text-sm font-medium px-2 py-1.5 rounded hover:bg-accent" onClick={onNavigate}>Reading</Link>
      <Link href="/settings" className="text-sm font-medium px-2 py-1.5 rounded hover:bg-accent" onClick={onNavigate}>Settings</Link>
    </nav>
  )
}

export default function NotesPage() {
  const [tagFilter, setTagFilter] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const router = useRouter()
  const { data: notes, isLoading } = trpc.note.list.useQuery(undefined, { refetchInterval: 30000 })
  const create = trpc.note.create.useMutation({
    onSuccess: note => router.push(`/notes/${note.slug}`),
  })

  const filtered = tagFilter
    ? notes?.filter(n => {
        try { return JSON.parse(n.tags).includes(tagFilter) } catch { return false }
      })
    : notes

  const closeSidebar = () => setSidebarOpen(false)

  return (
    <div className="flex min-h-screen">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/40 lg:hidden"
          onClick={closeSidebar}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed top-0 left-0 h-full z-30 w-56 shrink-0 border-r p-4 flex flex-col gap-4 bg-background
          transition-transform duration-200
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:relative lg:translate-x-0 lg:z-auto
        `}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
      >
        <button
          className="lg:hidden absolute top-4 right-4 p-1 text-muted-foreground hover:text-foreground"
          onClick={() => setSidebarOpen(false)}
          aria-label="Close navigation"
        >
          <X className="h-5 w-5" />
        </button>
        <NavLinks onNavigate={closeSidebar} />
        <div className="border-t pt-4">
          <CalendarNavigator />
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 p-6 max-w-3xl lg:ml-0">
        {/* Mobile hamburger */}
        <div className="flex items-center gap-3 mb-6 lg:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1.5 rounded hover:bg-accent"
            aria-label="Open sidebar"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <h1 className="text-2xl font-bold">Notes</h1>
          <Button onClick={() => create.mutate({ title: 'Untitled' })} disabled={create.isPending} className="ml-auto">
            New note
          </Button>
        </div>

        {/* Desktop header */}
        <div className="hidden lg:flex items-center justify-between mb-6">
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
          {isLoading && (
            Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))
          )}
          {!isLoading && filtered?.map(note => {
            let tags: string[] = []
            try { tags = JSON.parse(note.tags) } catch { /* noop */ }
            const excerpt = stripMarkdown(note.body ?? '').slice(0, 120)
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
          {!isLoading && filtered?.length === 0 && (
            <p className="text-muted-foreground text-sm">No notes yet. Create one above.</p>
          )}
        </div>
      </main>
    </div>
  )
}
