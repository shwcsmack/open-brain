'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import { trpc } from '@/lib/trpc'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'

type ReadingSourceType = 'NOTE' | 'URL' | 'WIKIPEDIA' | 'EXTRACT'

const SOURCE_LABELS: Record<ReadingSourceType, string> = {
  NOTE: 'Note',
  URL: 'URL',
  WIKIPEDIA: 'Wikipedia',
  EXTRACT: 'Extract',
}

const SOURCE_VARIANTS: Record<ReadingSourceType, 'default' | 'secondary' | 'outline'> = {
  NOTE: 'default',
  URL: 'outline',
  WIKIPEDIA: 'secondary',
  EXTRACT: 'outline',
}

const FOCUS_RING =
  'outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'

const NAV_LINK = cn(
  'text-sm font-medium px-2 py-1.5 rounded hover:bg-accent transition-colors shrink-0',
  FOCUS_RING
)

const ARCHIVE_SUBLINK = cn(NAV_LINK, 'pl-6')

const APP_NAV_BEFORE_READING = [
  { href: '/', label: 'Notes' },
  { href: '/tasks', label: 'Tasks' },
  { href: '/graph', label: 'Graph' },
  { href: '/decks', label: 'Decks' },
  { href: '/review', label: 'Review' },
] as const

const APP_NAV_AFTER_ARCHIVE = [{ href: '/settings', label: 'Settings' }] as const

function trpcErrorMessage(err: { message?: string } | null | undefined): string {
  return err?.message?.trim() || 'Something went wrong. Try again.'
}

function getEmptyMessage(
  archivedCount: number,
  filteredCount: number,
  sourceFilter: ReadingSourceType | undefined,
  searchLower: string
): string | null {
  if (filteredCount > 0) return null

  if (sourceFilter && archivedCount === 0) {
    return `No archived ${SOURCE_LABELS[sourceFilter].toLowerCase()} items.`
  }

  if (searchLower) {
    return 'No archived items match your search.'
  }

  if (archivedCount === 0) {
    return 'No archived items yet.'
  }

  return null
}

function ArchiveNavLinks({ className, archiveClassName }: { className?: string; archiveClassName?: string }) {
  return (
    <nav className={className} aria-label="App navigation">
      {APP_NAV_BEFORE_READING.map(link => (
        <Link key={link.href} href={link.href} className={NAV_LINK}>
          {link.label}
        </Link>
      ))}
      <Link href="/reading" className={NAV_LINK}>
        Reading
      </Link>
      <Link
        href="/reading/archive"
        aria-current="page"
        className={cn(ARCHIVE_SUBLINK, archiveClassName ?? 'bg-accent')}
      >
        Archive
      </Link>
      {APP_NAV_AFTER_ARCHIVE.map(link => (
        <Link key={link.href} href={link.href} className={NAV_LINK}>
          {link.label}
        </Link>
      ))}
    </nav>
  )
}

export default function ReadingArchivePage() {
  const [sourceFilter, setSourceFilter] = useState<ReadingSourceType | undefined>()
  const [search, setSearch] = useState('')

  const {
    data: archived = [],
    isLoading,
    isError,
    error,
    refetch,
    isFetched,
  } = trpc.reading.listArchived.useQuery(sourceFilter ? { sourceType: sourceFilter } : undefined)

  const searchLower = search.trim().toLowerCase()

  const filtered = useMemo(() => {
    if (!searchLower) return archived
    return archived.filter(item => item.title.toLowerCase().includes(searchLower))
  }, [archived, searchLower])

  const emptyMessage = getEmptyMessage(
    archived.length,
    filtered.length,
    sourceFilter,
    searchLower
  )

  const showList = isFetched && !isError && filtered.length > 0

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <aside className="hidden lg:flex w-56 shrink-0 border-r p-4 flex-col gap-4">
        <ArchiveNavLinks className="flex flex-col gap-1" />
      </aside>

      <main className="flex-1 p-6 max-w-3xl">
        <ArchiveNavLinks
          className="lg:hidden flex gap-1 overflow-x-auto border-b pb-3 mb-4 -mx-1 px-1 shrink-0"
          archiveClassName="bg-accent shrink-0"
        />

        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Reading Archive</h1>
          <Link
            href="/reading"
            className={cn('text-sm text-muted-foreground hover:underline', FOCUS_RING, 'rounded')}
          >
            ← Reading Queue
          </Link>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <Input
            type="search"
            placeholder="Search by title..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            aria-label="Search archived items by title"
            className="flex-1"
          />
          <select
            className={cn('text-sm border rounded px-2 py-1.5 bg-background shrink-0', FOCUS_RING)}
            value={sourceFilter ?? ''}
            onChange={e =>
              setSourceFilter((e.target.value as ReadingSourceType) || undefined)
            }
            aria-label="Filter by source type"
          >
            <option value="">All sources</option>
            {(Object.keys(SOURCE_LABELS) as ReadingSourceType[]).map(type => (
              <option key={type} value={type}>
                {SOURCE_LABELS[type]}
              </option>
            ))}
          </select>
        </div>

        {isLoading && (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        )}

        {isFetched && isError && (
          <div className="py-8 text-center">
            <p className="text-sm text-destructive mb-4">{trpcErrorMessage(error)}</p>
            <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
              Try again
            </Button>
          </div>
        )}

        {isFetched && !isError && emptyMessage && (
          <p className="text-muted-foreground text-sm py-8 text-center">{emptyMessage}</p>
        )}

        {showList && (
          <div className="flex flex-col gap-2">
            {filtered.map(item => {
              const sourceType = item.sourceType as ReadingSourceType
              return (
                <Link
                  key={item.id}
                  href={`/reading/${item.id}`}
                  className={cn(
                    'flex items-center justify-between gap-3 p-3 rounded-lg border transition-colors hover:bg-accent/30',
                    FOCUS_RING
                  )}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Badge variant={SOURCE_VARIANTS[sourceType] ?? 'outline'}>
                      {SOURCE_LABELS[sourceType] ?? item.sourceType}
                    </Badge>
                    <span className="text-sm font-medium truncate">{item.title}</span>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0 whitespace-nowrap">
                    {item.archivedAt
                      ? format(new Date(item.archivedAt), 'MMM d, yyyy')
                      : '—'}
                  </span>
                </Link>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
