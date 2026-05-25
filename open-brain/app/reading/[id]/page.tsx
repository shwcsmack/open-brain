'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { notFound, useParams, useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { TRPCClientError } from '@trpc/client'
import { toast } from 'sonner'
import { trpc } from '@/lib/trpc'
import { cn } from '@/lib/utils'
import { ExtractHighlighter } from '@/components/reading/ExtractHighlighter'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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

const NAV_LINK_CLASS = cn(
  'text-sm font-medium px-2 py-1.5 rounded hover:bg-accent',
  FOCUS_RING
)

function parseHiddenPassagesJson(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((entry): entry is string => typeof entry === 'string')
  } catch {
    return []
  }
}

function trpcErrorMessage(err: { message?: string } | null | undefined): string {
  return err?.message?.trim() || 'Something went wrong. Try again.'
}

function isTrpcNotFound(error: unknown): boolean {
  return error instanceof TRPCClientError && error.data?.code === 'NOT_FOUND'
}

const READING_NAV_LINKS = [
  { href: '/', label: 'Notes' },
  { href: '/tasks', label: 'Tasks' },
  { href: '/graph', label: 'Graph' },
  { href: '/decks', label: 'Decks' },
  { href: '/review', label: 'Review' },
  { href: '/reading', label: 'Reading', active: true },
  { href: '/settings', label: 'Settings' },
] as const

function ReadingNavLinks({ className }: { className?: string }) {
  return (
    <nav className={className} aria-label="App navigation">
      {READING_NAV_LINKS.map(link => (
        <span key={link.href} className="contents">
          <Link
            href={link.href}
            aria-current={'active' in link && link.active ? 'page' : undefined}
            className={cn(
              NAV_LINK_CLASS,
              'active' in link && link.active && 'bg-accent'
            )}
          >
            {link.label}
          </Link>
          {link.href === '/reading' && (
            <Link
              href="/reading/archive"
              className={cn(NAV_LINK_CLASS, 'pl-6 text-muted-foreground')}
            >
              Archive
            </Link>
          )}
        </span>
      ))}
    </nav>
  )
}

function ReadingDetailShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <aside className="hidden lg:flex w-56 shrink-0 border-r p-4 flex-col gap-4">
        <ReadingNavLinks className="flex flex-col gap-1" />
      </aside>
      <main className="flex-1 p-6 max-w-5xl">
        <ReadingNavLinks className="lg:hidden flex gap-1 overflow-x-auto border-b pb-3 mb-4 -mx-1 px-1 shrink-0" />
        {children}
      </main>
    </div>
  )
}

function DetailLoading() {
  return (
    <ReadingDetailShell>
      <Skeleton className="h-4 w-32 mb-6" />
      <div className="flex flex-col lg:flex-row gap-6">
        <div className="flex-1 min-w-0 space-y-4">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-48 w-full" />
        </div>
        <aside className="hidden lg:block w-56 shrink-0 space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-16 w-full" />
        </aside>
      </div>
    </ReadingDetailShell>
  )
}

function LoadErrorPanel({
  message,
  onRetry,
}: {
  message: string
  onRetry: () => void
}) {
  return (
    <ReadingDetailShell>
      <Link
        href="/reading"
        className={cn('text-sm text-muted-foreground hover:underline mb-6 inline-block', FOCUS_RING)}
      >
        ← Reading Queue
      </Link>
      <p className="text-sm text-muted-foreground mb-4">{message}</p>
      <Button type="button" variant="outline" size="sm" onClick={onRetry}>
        Try again
      </Button>
    </ReadingDetailShell>
  )
}

export default function ReadingItemDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = typeof params.id === 'string' ? params.id : ''
  const utils = trpc.useUtils()

  const {
    data: item,
    isLoading,
    isError,
    error,
    refetch,
    isFetched,
  } = trpc.reading.getById.useQuery({ id }, { enabled: !!id, retry: false })

  const { data: extracts = [] } = trpc.reading.listAll.useQuery(
    { parentItemId: id },
    { enabled: !!id && !!item }
  )

  const { data: notes = [] } = trpc.note.listByReadingItem.useQuery(id, {
    enabled: !!id && !!item,
  })
  const { data: flashcards = [] } = trpc.flashcard.listByReadingItem.useQuery(id, {
    enabled: !!id && !!item,
  })

  const [localHiddenPassages, setLocalHiddenPassages] = useState<string[]>([])

  useEffect(() => {
    if (item) setLocalHiddenPassages(parseHiddenPassagesJson(item.hiddenPassages))
  }, [item?.id, item?.hiddenPassages])

  const restorePassageMutation = trpc.reading.restorePassage.useMutation()

  const unarchiveMutation = trpc.reading.unarchive.useMutation({
    onSuccess: () => {
      toast.success('Restored to reading queue')
      void utils.reading.getById.invalidate({ id })
      void utils.reading.listDue.invalidate()
      void utils.reading.listAll.invalidate()
      router.push('/reading')
    },
    onError: err => toast.error(trpcErrorMessage(err)),
  })

  const handleRestorePassages = useCallback(
    async (texts: string[]) => {
      if (!item || texts.length === 0) return
      const itemId = item.id
      let previous: string[] = []
      setLocalHiddenPassages(prev => {
        previous = prev
        let next = [...prev]
        for (const text of texts) {
          const idx = next.indexOf(text)
          if (idx === -1) continue
          next = [...next.slice(0, idx), ...next.slice(idx + 1)]
        }
        return next
      })

      try {
        for (const text of texts) {
          await restorePassageMutation.mutateAsync({ id: itemId, text })
        }
        void utils.reading.getById.invalidate({ id: itemId })
      } catch {
        try {
          await utils.reading.getById.invalidate({ id: itemId })
          const refetched = await utils.reading.getById.fetch({ id: itemId })
          setLocalHiddenPassages(parseHiddenPassagesJson(refetched.hiddenPassages))
        } catch {
          setLocalHiddenPassages(previous)
        }
        toast.error(
          texts.length === 1 ? 'Failed to restore passage' : 'Failed to restore hidden passages'
        )
      }
    },
    [item, restorePassageMutation, utils.reading.getById]
  )

  if (!id) {
    notFound()
  }

  if (isLoading) return <DetailLoading />

  if (isFetched && isError) {
    if (isTrpcNotFound(error)) {
      notFound()
    }
    return (
      <LoadErrorPanel
        message={trpcErrorMessage(error)}
        onRetry={() => void refetch()}
      />
    )
  }

  if (!item) {
    return <DetailLoading />
  }

  const sourceType = item.sourceType as ReadingSourceType
  const articleUrl = item.articleUrl ?? item.url
  const extractedTexts = extracts
    .map(e => e.extractedText)
    .filter((text): text is string => !!text)

  const unarchivePending = unarchiveMutation.isPending

  return (
    <ReadingDetailShell>
      <div className="flex items-center justify-between gap-4 mb-6">
        <Link
          href="/reading"
          className={cn('text-sm text-muted-foreground hover:underline', FOCUS_RING)}
        >
          ← Reading Queue
        </Link>
        {!item.archivedAt && (
          <Button
            size="sm"
            onClick={() =>
              router.push(`/reading/session?startFrom=${encodeURIComponent(item.id)}`)
            }
          >
            Start reading from here
          </Button>
        )}
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        <div className="flex-1 min-w-0">
          {item.archivedAt && (
            <div
              role="status"
              aria-live="polite"
              aria-busy={unarchivePending}
              className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200"
            >
              <span>
                Archived · {format(new Date(item.archivedAt), 'MMM d, yyyy')}
              </span>
              <Button
                size="sm"
                variant="outline"
                className="border-amber-400 text-amber-800 hover:bg-amber-100 dark:border-amber-600 dark:text-amber-200 dark:hover:bg-amber-900/50"
                onClick={() => unarchiveMutation.mutate({ id: item.id })}
                disabled={unarchivePending}
                aria-busy={unarchivePending}
              >
                {unarchivePending ? 'Restoring…' : 'Restore to queue'}
              </Button>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 mb-2">
            <Badge variant={SOURCE_VARIANTS[sourceType] ?? 'outline'}>
              {SOURCE_LABELS[sourceType] ?? item.sourceType}
            </Badge>
            {articleUrl && (
              <a
                href={articleUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  'text-xs text-muted-foreground truncate hover:underline max-w-full rounded-sm',
                  FOCUS_RING
                )}
              >
                {articleUrl}
              </a>
            )}
          </div>

          <h1 className="text-2xl font-bold mb-4">{item.title}</h1>

          <ExtractHighlighter
            markdown={item.content}
            extractedTexts={extractedTexts}
            hiddenPassages={localHiddenPassages}
            onRestorePassages={handleRestorePassages}
          />
        </div>

        <aside className="w-full lg:w-56 shrink-0 text-sm space-y-6">
          <section>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Review Stats
            </h2>
            <dl className="flex flex-col gap-1 text-muted-foreground">
              <div className="flex justify-between gap-2">
                <dt>Reviews</dt>
                <dd className="font-medium text-foreground tabular-nums">{item.reps}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>Stability</dt>
                <dd className="font-medium text-foreground tabular-nums">
                  {item.stability.toFixed(1)}d
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>Difficulty</dt>
                <dd className="font-medium text-foreground tabular-nums">
                  {item.difficulty.toFixed(2)}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>Last review</dt>
                <dd className="font-medium text-foreground">
                  {item.lastReview ? format(new Date(item.lastReview), 'MMM d') : '—'}
                </dd>
              </div>
            </dl>
          </section>

          <section>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Extracts{extracts.length > 0 ? ` (${extracts.length})` : ''}
            </h2>
            {extracts.length === 0 ? (
              <p className="text-muted-foreground">No extracts yet.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {extracts.map(e => (
                  <li key={e.id}>
                    <Link
                      href={`/reading/${e.id}`}
                      className={cn('block truncate rounded border p-2 hover:bg-accent', FOCUS_RING)}
                    >
                      {e.extractedText?.slice(0, 60) ?? e.title}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Notes{notes.length > 0 ? ` (${notes.length})` : ''}
            </h2>
            {notes.length === 0 ? (
              <p className="text-muted-foreground">No linked notes.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {notes.map(n => (
                  <li key={n.id}>
                    <Link
                      href={`/notes/${n.slug}`}
                      className={cn('block truncate rounded border p-2 hover:bg-accent', FOCUS_RING)}
                    >
                      {n.title}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Flashcards{flashcards.length > 0 ? ` (${flashcards.length})` : ''}
            </h2>
            {flashcards.length === 0 ? (
              <p className="text-muted-foreground">No flashcards yet.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {flashcards.map(f => (
                  <li
                    key={f.id}
                    className="truncate rounded border p-2 text-muted-foreground"
                  >
                    {f.front.slice(0, 60)}
                    {f.front.length > 60 ? '…' : ''}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </ReadingDetailShell>
  )
}
