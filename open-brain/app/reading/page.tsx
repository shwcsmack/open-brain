'use client'
import { useState } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import { trpc } from '@/lib/trpc'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

type ReadingSourceType = 'NOTE' | 'URL' | 'WIKIPEDIA_SECTION' | 'EXTRACT'

const SOURCE_LABELS: Record<ReadingSourceType, string> = {
  NOTE: 'Note',
  URL: 'URL',
  WIKIPEDIA_SECTION: 'Wikipedia',
  EXTRACT: 'Extract',
}

const SOURCE_VARIANTS: Record<ReadingSourceType, 'default' | 'secondary' | 'outline'> = {
  NOTE: 'default',
  URL: 'outline',
  WIKIPEDIA_SECTION: 'secondary',
  EXTRACT: 'outline',
}

function isDue(due: Date | string) {
  return new Date(due).getTime() <= Date.now()
}

function formatDue(due: Date | string) {
  return isDue(due) ? 'due now' : `due ${format(new Date(due), 'MMM d')}`
}

function priorityVariant(priority: number): 'destructive' | 'secondary' | 'outline' {
  if (priority >= 70) return 'destructive'
  if (priority >= 40) return 'secondary'
  return 'outline'
}

export default function ReadingPage() {
  const [tab, setTab] = useState<'due' | 'all'>('due')
  const [sourceTypeFilter, setSourceTypeFilter] = useState<ReadingSourceType | undefined>()

  const { data: dueItems = [], isLoading: dueLoading } = trpc.reading.listDue.useQuery(undefined, {
    refetchInterval: 30000,
  })

  const listAllInput = sourceTypeFilter ? { sourceType: sourceTypeFilter } : undefined
  const { data: allItems = [], isLoading: allLoading } = trpc.reading.listAll.useQuery(listAllInput, {
    enabled: tab === 'all',
    refetchInterval: 30000,
  })

  const items = tab === 'due' ? dueItems : allItems
  const isLoading = tab === 'due' ? dueLoading : allLoading

  return (
    <div className="flex min-h-screen">
      <aside className="hidden lg:flex w-56 shrink-0 border-r p-4 flex-col gap-4">
        <nav className="flex flex-col gap-1">
          <Link href="/" className="text-sm font-medium px-2 py-1.5 rounded hover:bg-accent">Notes</Link>
          <Link href="/tasks" className="text-sm font-medium px-2 py-1.5 rounded hover:bg-accent">Tasks</Link>
          <Link href="/graph" className="text-sm font-medium px-2 py-1.5 rounded hover:bg-accent">Graph</Link>
          <Link href="/decks" className="text-sm font-medium px-2 py-1.5 rounded hover:bg-accent">Decks</Link>
          <Link href="/review" className="text-sm font-medium px-2 py-1.5 rounded hover:bg-accent">Review</Link>
          <Link href="/reading" className="text-sm font-medium px-2 py-1.5 rounded hover:bg-accent bg-accent">Reading</Link>
          <Link href="/settings" className="text-sm font-medium px-2 py-1.5 rounded hover:bg-accent">Settings</Link>
        </nav>
      </aside>

      <main className="flex-1 p-6 max-w-3xl">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Reading Queue</h1>
          <div className="flex gap-2">
            {dueItems.length > 0 && (
              <Link href="/reading/session">
                <Button size="sm">Start reading ({dueItems.length} due)</Button>
              </Link>
            )}
            <Link href="/reading/add">
              <Button variant="outline" size="sm">Add to queue</Button>
            </Link>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 mb-4">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setTab('due')}
              className={`px-3 py-1.5 rounded text-sm font-medium ${
                tab === 'due' ? 'bg-accent' : 'hover:bg-accent/50'
              }`}
            >
              Due {dueItems.length > 0 && `(${dueItems.length})`}
            </button>
            <button
              type="button"
              onClick={() => setTab('all')}
              className={`px-3 py-1.5 rounded text-sm font-medium ${
                tab === 'all' ? 'bg-accent' : 'hover:bg-accent/50'
              }`}
            >
              All
            </button>
          </div>

          {tab === 'all' && (
            <select
              className="text-sm border rounded px-2 py-1"
              value={sourceTypeFilter ?? ''}
              onChange={e =>
                setSourceTypeFilter((e.target.value as ReadingSourceType) || undefined)
              }
            >
              <option value="">All sources</option>
              {(Object.keys(SOURCE_LABELS) as ReadingSourceType[]).map(type => (
                <option key={type} value={type}>
                  {SOURCE_LABELS[type]}
                </option>
              ))}
            </select>
          )}
        </div>

        {isLoading && (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        )}

        {!isLoading && items.length === 0 && (
          <p className="text-muted-foreground text-sm py-8 text-center">
            {tab === 'due'
              ? 'Nothing due right now. Great work!'
              : sourceTypeFilter
                ? `No ${SOURCE_LABELS[sourceTypeFilter].toLowerCase()} items in your queue.`
                : 'Your reading queue is empty. Add something to get started.'}
          </p>
        )}

        {!isLoading && items.length > 0 && (
          <div className="space-y-2">
            {items.map(item => {
              const sourceType = item.sourceType as ReadingSourceType
              return (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-3 p-3 rounded-lg border"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Badge variant={SOURCE_VARIANTS[sourceType] ?? 'outline'}>
                      {SOURCE_LABELS[sourceType] ?? item.sourceType}
                    </Badge>
                    <span className="text-sm font-medium truncate">{item.title}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={priorityVariant(item.priority)} className="tabular-nums">
                      {item.priority}
                    </Badge>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatDue(item.due)}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
