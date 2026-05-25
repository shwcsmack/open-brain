'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { Archive, Trash2 } from 'lucide-react'
import type { inferRouterOutputs } from '@trpc/server'
import { toast } from 'sonner'
import { trpc } from '@/lib/trpc'
import { cn } from '@/lib/utils'
import type { AppRouter } from '@/server/root'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

type ReadingSourceType = 'NOTE' | 'URL' | 'WIKIPEDIA' | 'EXTRACT'

type ListAllInput = { sourceType: ReadingSourceType } | undefined

type ReadingRouterOutput = inferRouterOutputs<AppRouter>['reading']

type ListCacheContext = {
  listAllInput: ListAllInput
  prevDue: ReadingRouterOutput['listDue'] | undefined
  prevAll: ReadingRouterOutput['listAll'] | undefined
  prevSelectedIds?: Set<string>
}

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

const ROW_ACTIONS_VISIBILITY =
  'opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 transition-opacity'

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

function trpcErrorMessage(err: { message?: string } | null | undefined): string {
  return err?.message?.trim() || 'Something went wrong. Try again.'
}

function tabButtonClass(active: boolean) {
  return cn(
    'px-3 py-1.5 rounded text-sm font-medium transition-colors',
    FOCUS_RING,
    active ? 'bg-accent' : 'hover:bg-accent/50'
  )
}

function restoreListCaches(
  utils: ReturnType<typeof trpc.useUtils>,
  ctx: ListCacheContext | undefined,
  restoreSelection?: (ids: Set<string>) => void
) {
  if (!ctx) return
  if (ctx.prevDue !== undefined) utils.reading.listDue.setData(undefined, ctx.prevDue)
  if (ctx.prevAll !== undefined) utils.reading.listAll.setData(ctx.listAllInput, ctx.prevAll)
  if (ctx.prevSelectedIds && restoreSelection) restoreSelection(ctx.prevSelectedIds)
}

export default function ReadingPage() {
  const router = useRouter()
  const utils = trpc.useUtils()

  const [tab, setTab] = useState<'due' | 'all'>('due')
  const [sourceTypeFilter, setSourceTypeFilter] = useState<ReadingSourceType | undefined>()
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false)

  const listAllInput: ListAllInput = sourceTypeFilter
    ? { sourceType: sourceTypeFilter }
    : undefined

  const { data: dueItems = [], isLoading: dueLoading } = trpc.reading.listDue.useQuery(undefined, {
    refetchInterval: 30000,
  })

  const { data: allItems = [], isLoading: allLoading } = trpc.reading.listAll.useQuery(listAllInput, {
    enabled: tab === 'all',
    refetchInterval: 30000,
  })

  const items = tab === 'due' ? dueItems : allItems
  const isLoading = tab === 'due' ? dueLoading : allLoading

  const selectedCount = selectedIds.size
  const selectedIdList = Array.from(selectedIds)

  useEffect(() => {
    if (selectedCount === 0) setBulkDeleteConfirm(false)
  }, [selectedCount])

  const removeFromCaches = useCallback(
    (ids: string[], listAllKey: ListAllInput) => {
      const idSet = new Set(ids)
      utils.reading.listDue.setData(undefined, old => old?.filter(i => !idSet.has(i.id)))
      utils.reading.listAll.setData(listAllKey, old => old?.filter(i => !idSet.has(i.id)))
    },
    [utils]
  )

  const invalidateLists = useCallback(() => {
    void utils.reading.listDue.invalidate()
    void utils.reading.listAll.invalidate()
  }, [utils])

  const captureListContext = useCallback(async (): Promise<ListCacheContext> => {
    const listAllKey = listAllInput
    await Promise.all([utils.reading.listDue.cancel(), utils.reading.listAll.cancel()])
    return {
      listAllInput: listAllKey,
      prevDue: utils.reading.listDue.getData(),
      prevAll: utils.reading.listAll.getData(listAllKey),
    }
  }, [utils, listAllInput])

  const pruneSelection = useCallback((ids: string[]) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      for (const id of ids) next.delete(id)
      return next
    })
  }, [])

  const restoreSelection = useCallback((ids: Set<string>) => {
    setSelectedIds(ids)
  }, [])

  const archiveMutation = trpc.reading.archive.useMutation({
    onMutate: async ({ id }) => {
      const ctx = await captureListContext()
      removeFromCaches([id], ctx.listAllInput)
      pruneSelection([id])
      setPendingDeleteId(current => (current === id ? null : current))
      return ctx
    },
    onError: (err, _vars, ctx) => {
      restoreListCaches(utils, ctx)
      toast.error(trpcErrorMessage(err))
    },
    onSettled: invalidateLists,
  })

  const deleteMutation = trpc.reading.delete.useMutation({
    onMutate: async ({ id }) => {
      const ctx = await captureListContext()
      removeFromCaches([id], ctx.listAllInput)
      pruneSelection([id])
      setPendingDeleteId(null)
      return ctx
    },
    onError: (err, _vars, ctx) => {
      restoreListCaches(utils, ctx)
      toast.error(trpcErrorMessage(err))
    },
    onSettled: invalidateLists,
  })

  const bulkArchiveMutation = trpc.reading.bulkArchive.useMutation({
    onMutate: async ({ ids }) => {
      const ctx = await captureListContext()
      const prevSelectedIds = new Set(ids)
      removeFromCaches(ids, ctx.listAllInput)
      setSelectedIds(new Set())
      setBulkDeleteConfirm(false)
      return { ...ctx, prevSelectedIds }
    },
    onError: (err, _vars, ctx) => {
      restoreListCaches(utils, ctx, restoreSelection)
      toast.error(trpcErrorMessage(err))
    },
    onSettled: invalidateLists,
  })

  const bulkDeleteMutation = trpc.reading.bulkDelete.useMutation({
    onMutate: async ({ ids }) => {
      const ctx = await captureListContext()
      const prevSelectedIds = new Set(ids)
      removeFromCaches(ids, ctx.listAllInput)
      setSelectedIds(new Set())
      setBulkDeleteConfirm(false)
      return { ...ctx, prevSelectedIds }
    },
    onError: (err, _vars, ctx) => {
      restoreListCaches(utils, ctx, restoreSelection)
      toast.error(trpcErrorMessage(err))
    },
    onSettled: invalidateLists,
  })

  const toggleSelectMode = () => {
    setSelectMode(m => !m)
    setSelectedIds(new Set())
    setPendingDeleteId(null)
    setBulkDeleteConfirm(false)
  }

  const toggleSelected = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const navigateToSession = (id: string) => {
    router.push(`/reading/session?startFrom=${encodeURIComponent(id)}`)
  }

  const anyMutationPending =
    archiveMutation.isPending ||
    deleteMutation.isPending ||
    bulkArchiveMutation.isPending ||
    bulkDeleteMutation.isPending

  return (
    <div className="flex min-h-screen">
      <aside className="hidden lg:flex w-56 shrink-0 border-r p-4 flex-col gap-4">
        <nav className="flex flex-col gap-1">
          <Link href="/" className="text-sm font-medium px-2 py-1.5 rounded hover:bg-accent">
            Notes
          </Link>
          <Link href="/tasks" className="text-sm font-medium px-2 py-1.5 rounded hover:bg-accent">
            Tasks
          </Link>
          <Link href="/graph" className="text-sm font-medium px-2 py-1.5 rounded hover:bg-accent">
            Graph
          </Link>
          <Link href="/decks" className="text-sm font-medium px-2 py-1.5 rounded hover:bg-accent">
            Decks
          </Link>
          <Link href="/review" className="text-sm font-medium px-2 py-1.5 rounded hover:bg-accent">
            Review
          </Link>
          <Link
            href="/reading"
            className="text-sm font-medium px-2 py-1.5 rounded hover:bg-accent bg-accent"
          >
            Reading
          </Link>
          <Link
            href="/reading/archive"
            className="text-sm font-medium px-2 py-1.5 rounded hover:bg-accent pl-6 text-muted-foreground"
          >
            Archive
          </Link>
          <Link href="/settings" className="text-sm font-medium px-2 py-1.5 rounded hover:bg-accent">
            Settings
          </Link>
        </nav>
      </aside>

      <main className="flex-1 p-6 max-w-3xl pb-24">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Reading Queue</h1>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              type="button"
              variant={selectMode ? 'secondary' : 'outline'}
              size="sm"
              aria-pressed={selectMode}
              onClick={toggleSelectMode}
            >
              {selectMode ? 'Done' : 'Select'}
            </Button>
            {dueItems.length > 0 && (
              <Link href="/reading/session">
                <Button size="sm">Start reading ({dueItems.length} due)</Button>
              </Link>
            )}
            <Link href="/reading/add">
              <Button variant="outline" size="sm">
                Add to queue
              </Button>
            </Link>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 mb-4">
          <div className="flex gap-2" role="tablist" aria-label="Queue view">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'due'}
              onClick={() => setTab('due')}
              className={tabButtonClass(tab === 'due')}
            >
              Due {dueItems.length > 0 && `(${dueItems.length})`}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'all'}
              onClick={() => setTab('all')}
              className={tabButtonClass(tab === 'all')}
            >
              All
            </button>
          </div>

          {tab === 'all' && (
            <select
              className={cn('text-sm border rounded px-2 py-1 bg-background', FOCUS_RING)}
              value={sourceTypeFilter ?? ''}
              onChange={e =>
                setSourceTypeFilter((e.target.value as ReadingSourceType) || undefined)
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
          <div className="flex flex-col gap-2">
            {items.map(item => {
              const sourceType = item.sourceType as ReadingSourceType
              const isSelected = selectedIds.has(item.id)
              const isPendingDelete = pendingDeleteId === item.id

              if (selectMode) {
                return (
                  <label
                    key={item.id}
                    className={cn(
                      'group flex items-center gap-3 p-3 rounded-lg border transition-colors cursor-pointer',
                      isSelected && 'bg-accent/50 border-accent'
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelected(item.id)}
                      className={cn('h-4 w-4 shrink-0', FOCUS_RING)}
                      aria-label={`Select ${item.title}`}
                    />
                    <span className="flex items-center gap-3 min-w-0 flex-1">
                      <Badge variant={SOURCE_VARIANTS[sourceType] ?? 'outline'}>
                        {SOURCE_LABELS[sourceType] ?? item.sourceType}
                      </Badge>
                      <span className="text-sm font-medium truncate">{item.title}</span>
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant={priorityVariant(item.priority)} className="tabular-nums">
                        {item.priority}
                      </Badge>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatDue(item.due)}
                      </span>
                    </div>
                  </label>
                )
              }

              return (
                <div
                  key={item.id}
                  className="group flex items-center gap-3 p-3 rounded-lg border transition-colors hover:bg-accent/30"
                >
                  <button
                    type="button"
                    disabled={isPendingDelete}
                    onClick={() => navigateToSession(item.id)}
                    className={cn(
                      'flex flex-1 min-w-0 items-center gap-3 rounded-md text-left',
                      FOCUS_RING,
                      isPendingDelete ? 'cursor-default opacity-80' : 'cursor-pointer'
                    )}
                  >
                    <Badge variant={SOURCE_VARIANTS[sourceType] ?? 'outline'}>
                      {SOURCE_LABELS[sourceType] ?? item.sourceType}
                    </Badge>
                    <span className="text-sm font-medium truncate">{item.title}</span>
                  </button>

                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={priorityVariant(item.priority)} className="tabular-nums">
                      {item.priority}
                    </Badge>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatDue(item.due)}
                    </span>

                    <div className="flex items-center gap-1 ml-1">
                      {isPendingDelete ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            Delete this item?
                          </span>
                          <Button
                            type="button"
                            variant="destructive"
                            size="xs"
                            disabled={deleteMutation.isPending}
                            onClick={() => deleteMutation.mutate({ id: item.id })}
                          >
                            Confirm
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="xs"
                            onClick={() => setPendingDeleteId(null)}
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <div className={cn('flex items-center gap-0.5', ROW_ACTIONS_VISIBILITY)}>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label="Archive item"
                            disabled={anyMutationPending}
                            onClick={() => archiveMutation.mutate({ id: item.id })}
                          >
                            <Archive />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label="Delete item"
                            disabled={anyMutationPending}
                            onClick={() => setPendingDeleteId(item.id)}
                          >
                            <Trash2 />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {selectMode && selectedCount > 0 && (
          <div className="sticky bottom-4 z-10 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-background p-3 shadow-sm">
            {bulkDeleteConfirm ? (
              <>
                <span className="text-sm text-muted-foreground">
                  Delete {selectedCount} selected {selectedCount === 1 ? 'item' : 'items'}?
                </span>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={bulkDeleteMutation.isPending}
                    onClick={() => bulkDeleteMutation.mutate({ ids: selectedIdList })}
                  >
                    Confirm delete
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setBulkDeleteConfirm(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </>
            ) : (
              <>
                <span className="text-sm font-medium">{selectedCount} selected</span>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={bulkArchiveMutation.isPending}
                    onClick={() => bulkArchiveMutation.mutate({ ids: selectedIdList })}
                  >
                    Archive selected
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => setBulkDeleteConfirm(true)}
                  >
                    Delete selected
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
