'use client'
import Link from 'next/link'
import { trpc } from '@/lib/trpc'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

export default function ReviewPage() {
  const { data, isLoading } = trpc.review.dueCounts.useQuery(undefined, {
    refetchInterval: 60000,
  })

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="hidden lg:flex w-56 shrink-0 border-r p-4 flex-col gap-4">
        <nav className="flex flex-col gap-1">
          <Link href="/" className="text-sm font-medium px-2 py-1.5 rounded hover:bg-accent">Notes</Link>
          <Link href="/tasks" className="text-sm font-medium px-2 py-1.5 rounded hover:bg-accent">Tasks</Link>
          <Link href="/graph" className="text-sm font-medium px-2 py-1.5 rounded hover:bg-accent">Graph</Link>
          <Link href="/decks" className="text-sm font-medium px-2 py-1.5 rounded hover:bg-accent">Decks</Link>
          <Link href="/review" className="text-sm font-medium px-2 py-1.5 rounded hover:bg-accent bg-accent">Review</Link>
          <Link href="/settings" className="text-sm font-medium px-2 py-1.5 rounded hover:bg-accent">Settings</Link>
        </nav>
      </aside>

      {/* Main content */}
      <main className="flex-1 p-6 max-w-3xl">
        <h1 className="text-2xl font-bold mb-6">Review</h1>

        {isLoading && <p className="text-muted-foreground text-sm">Loading...</p>}

        {data && (
          <div className="space-y-2">
            {/* All due cards row */}
            <Link
              href="/review/session"
              className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent/50 cursor-pointer"
            >
              <span className="font-medium">All due cards</span>
              <Badge variant={data.totalDue > 0 ? 'default' : 'secondary'}>
                {data.totalDue} due
              </Badge>
            </Link>

            {/* Per-deck rows */}
            {data.decks.map(deck => (
              <Link
                key={deck.deckId}
                href={`/review/session?deckId=${deck.deckId}`}
                className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent/50 cursor-pointer"
              >
                <span className="font-medium">{deck.deckName}</span>
                <Badge variant={deck.dueCount > 0 ? 'default' : 'secondary'}>
                  {deck.dueCount} due
                </Badge>
              </Link>
            ))}

            {data.decks.length === 0 && data.totalDue === 0 && (
              <p className="text-muted-foreground text-sm mt-4">
                No cards due right now. Create decks and add flashcards to get started.
              </p>
            )}

            {data.decks.length === 0 && (
              <div className="mt-4">
                <Link href="/decks">
                  <Button variant="outline" size="sm">Manage decks</Button>
                </Link>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
