'use client'
import Link from 'next/link'
import { trpc } from '@/lib/trpc'

export function BacklinksPanel({ noteId }: { noteId: string }) {
  const { data: backlinks } = trpc.noteLink.getBacklinks.useQuery({ noteId })

  if (!backlinks?.length) {
    return (
      <div className="text-sm text-muted-foreground p-4">No backlinks yet.</div>
    )
  }

  return (
    <div className="space-y-2 p-4">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Backlinks
      </h3>
      {backlinks.map(note => (
        <Link
          key={note.id}
          href={`/notes/${note.slug}`}
          className="block p-2 rounded hover:bg-accent"
        >
          <div className="font-medium text-sm">{note.title}</div>
          {note.excerpt && (
            <div className="text-xs text-muted-foreground truncate">{note.excerpt}</div>
          )}
        </Link>
      ))}
    </div>
  )
}
