'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Archive, MoreVertical, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { trpc } from '@/lib/trpc'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  ExtractHighlighter,
  lookupWikipediaImport,
  wikipediaLookupKeys,
} from '@/components/reading/ExtractHighlighter'
import { RatingBar } from '@/components/reading/RatingBar'
import { SelectionToolbar } from '@/components/reading/SelectionToolbar'
import { CardCreationModal } from '@/components/flashcard/CardCreationModal'

const SOURCE_LABELS: Record<string, string> = {
  NOTE: 'Note',
  URL: 'URL',
  WIKIPEDIA: 'Wikipedia',
  EXTRACT: 'Extract',
}

type ReadingItem = {
  id: string
  title: string
  content: string
  sourceType: string
  extractedText: string | null
  parentItemId: string | null
  hiddenPassages?: string | null
}

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

function queueFromStartInDue(items: ReadingItem[], startFromId: string) {
  const idx = items.findIndex(item => item.id === startFromId)
  if (idx === -1) return null
  return {
    current: items[idx],
    queue: [...items.slice(idx + 1), ...items.slice(0, idx)],
  }
}

function wikipediaAddInFlight(inFlight: Set<string>, href: string): boolean {
  return wikipediaLookupKeys(href).some(key => inFlight.has(key))
}

function markWikipediaAddInFlight(inFlight: Set<string>, href: string) {
  for (const key of wikipediaLookupKeys(href)) inFlight.add(key)
}

function clearWikipediaAddInFlight(inFlight: Set<string>, href: string) {
  for (const key of wikipediaLookupKeys(href)) inFlight.delete(key)
}

function titleFromWikipediaUrl(url: string): string {
  try {
    const parsed = new URL(url)
    const parts = parsed.pathname.split('/')
    const wikiIndex = parts.indexOf('wiki')
    if (wikiIndex === -1 || wikiIndex + 1 >= parts.length) return 'Wikipedia article'
    return decodeURIComponent(parts[wikiIndex + 1]).replace(/_/g, ' ')
  } catch {
    return 'Wikipedia article'
  }
}

function SessionShell({ children }: { children: React.ReactNode }) {
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
          <Link href="/reading" className="text-sm font-medium px-2 py-1.5 rounded hover:bg-accent bg-accent">
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
      <main className="flex-1 p-6 max-w-3xl">{children}</main>
    </div>
  )
}

export default function ReadingSessionPage() {
  const searchParams = useSearchParams()
  const startFromId = searchParams.get('startFrom')
  const utils = trpc.useUtils()
  const { data: dueItems, isLoading } = trpc.reading.listDue.useQuery(undefined, {
    refetchInterval: 30000,
  })
  const { data: importedWikipediaUrls } = trpc.reading.getImportedWikipediaUrls.useQuery()

  const [queue, setQueue] = useState<ReadingItem[]>([])
  const [current, setCurrent] = useState<ReadingItem | null>(null)
  const [done, setDone] = useState(false)
  const [sessionReady, setSessionReady] = useState(false)
  const [pendingArticleDelete, setPendingArticleDelete] = useState(false)
  const [sessionActionPending, setSessionActionPending] = useState(false)
  const [localExtracts, setLocalExtracts] = useState<string[]>([])
  const [localHiddenPassages, setLocalHiddenPassages] = useState<string[]>([])
  const addingWikipediaUrls = useRef(new Set<string>())
  const appliedStartFromRef = useRef<string | null | undefined>(undefined)
  const sessionReadyRef = useRef(false)
  const sessionGenerationRef = useRef(0)
  const advanceGuardRef = useRef(false)
  const sessionActionPendingRef = useRef(false)
  const menuTriggerRef = useRef<HTMLButtonElement>(null)
  const confirmDeleteRef = useRef<HTMLButtonElement>(null)
  const currentIdRef = useRef<string | null>(null)

  const [noteDialog, setNoteDialog] = useState<{ open: boolean; text: string; title: string }>({
    open: false,
    text: '',
    title: '',
  })
  const [flashcardModal, setFlashcardModal] = useState<{ open: boolean; front: string }>({
    open: false,
    front: '',
  })

  const { data: childItems = [] } = trpc.reading.listAll.useQuery(
    { parentItemId: current?.id },
    { enabled: !!current?.id }
  )

  const releaseActionLock = useCallback(() => {
    sessionActionPendingRef.current = false
    advanceGuardRef.current = false
    setSessionActionPending(false)
  }, [])

  const advance = useCallback(() => {
    setLocalExtracts([])
    setQueue(prev => {
      const next = prev[0]
      if (!next) {
        setDone(true)
        setCurrent(null)
        return []
      }
      setCurrent(next)
      return prev.slice(1)
    })
  }, [])

  useEffect(() => {
    releaseActionLock()
  }, [current?.id, releaseActionLock])

  const runSessionAction = useCallback(
    async (action: () => Promise<unknown>) => {
      if (sessionActionPendingRef.current || advanceGuardRef.current) return false

      const actionGeneration = sessionGenerationRef.current
      sessionActionPendingRef.current = true
      advanceGuardRef.current = true
      setSessionActionPending(true)

      try {
        await action()
        if (sessionGenerationRef.current !== actionGeneration) {
          releaseActionLock()
          return false
        }
        advance()
        return true
      } catch {
        releaseActionLock()
        return false
      }
    },
    [advance, releaseActionLock]
  )

  const reviewMutation = trpc.reading.review.useMutation()
  const extractMutation = trpc.reading.extract.useMutation({
    onSuccess: () => {
      utils.reading.listDue.invalidate()
      utils.reading.listAll.invalidate()
      toast.success('Added to reading queue')
    },
    onError: () => toast.error('Failed to extract passage'),
  })
  const terminateMutation = trpc.reading.terminateNote.useMutation({
    onSuccess: () => {
      toast.success('Saved as note')
      utils.reading.listDue.invalidate()
    },
    onError: () => toast.error('Failed to save note'),
  })
  const addWikipediaMutation = trpc.reading.addWikipedia.useMutation()
  const unarchiveMutation = trpc.reading.unarchive.useMutation()

  const invalidateLists = useCallback(() => {
    void utils.reading.listDue.invalidate()
    void utils.reading.listAll.invalidate()
    void utils.reading.getImportedWikipediaUrls.invalidate()
  }, [utils])

  const archiveMutation = trpc.reading.archive.useMutation({
    onSuccess: () => {
      invalidateLists()
      toast.success('Article archived')
      setPendingArticleDelete(false)
    },
    onError: err => toast.error(trpcErrorMessage(err)),
  })

  const deleteMutation = trpc.reading.delete.useMutation({
    onSuccess: () => {
      invalidateLists()
      toast.success('Article deleted')
      setPendingArticleDelete(false)
    },
    onError: err => toast.error(trpcErrorMessage(err)),
  })

  const hidePassageMutation = trpc.reading.hidePassage.useMutation()
  const restorePassageMutation = trpc.reading.restorePassage.useMutation()

  const articleMutationPending = archiveMutation.isPending || deleteMutation.isPending
  const sessionControlsBusy = sessionActionPending || articleMutationPending

  useEffect(() => {
    if (!dueItems) return

    const startFromChanged = appliedStartFromRef.current !== startFromId
    if (sessionReadyRef.current && !startFromChanged) return

    let cancelled = false
    appliedStartFromRef.current = startFromId
    if (startFromChanged) {
      sessionGenerationRef.current += 1
      sessionActionPendingRef.current = false
      advanceGuardRef.current = false
      setSessionActionPending(false)
      sessionReadyRef.current = false
      setSessionReady(false)
      setDone(false)
      setPendingArticleDelete(false)
      setLocalExtracts([])
    }

    const items = dueItems as ReadingItem[]

    async function initSession() {
      if (!startFromId) {
        if (cancelled) return
        setQueue(items.slice(1))
        setCurrent(items[0] ?? null)
        setDone(items.length === 0)
        sessionReadyRef.current = true
        setSessionReady(true)
        return
      }

      const rotated = queueFromStartInDue(items, startFromId)
      if (rotated) {
        if (cancelled) return
        setCurrent(rotated.current)
        setQueue(rotated.queue)
        setDone(false)
        sessionReadyRef.current = true
        setSessionReady(true)
        return
      }

      try {
        const item = await utils.reading.getById.fetch({ id: startFromId })
        if (cancelled) return
        setCurrent(item as ReadingItem)
        setQueue(items)
        setDone(false)
        sessionReadyRef.current = true
        setSessionReady(true)
      } catch {
        if (cancelled) return
        setQueue(items.slice(1))
        setCurrent(items[0] ?? null)
        setDone(items.length === 0)
        sessionReadyRef.current = true
        setSessionReady(true)
      }
    }

    void initSession()
    return () => {
      cancelled = true
    }
  }, [dueItems, startFromId, utils])

  useEffect(() => {
    setPendingArticleDelete(false)
  }, [current?.id])

  useEffect(() => {
    currentIdRef.current = current?.id ?? null
  }, [current?.id])

  useEffect(() => {
    if (!current) {
      setLocalHiddenPassages([])
      return
    }
    setLocalHiddenPassages(parseHiddenPassagesJson(current.hiddenPassages))
  }, [current?.id])

  const rollbackHiddenPassagesIfCurrent = useCallback((itemId: string, snapshot: string[]) => {
    if (currentIdRef.current === itemId) {
      setLocalHiddenPassages(snapshot)
    }
  }, [])

  useEffect(() => {
    if (!pendingArticleDelete) return
    confirmDeleteRef.current?.focus()
  }, [pendingArticleDelete])

  useEffect(() => {
    if (!pendingArticleDelete) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setPendingArticleDelete(false)
      requestAnimationFrame(() => menuTriggerRef.current?.focus())
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [pendingArticleDelete])

  const serverExtracts = childItems
    .filter(item => item.extractedText)
    .map(item => item.extractedText as string)
  const extractedTexts = [...new Set([...serverExtracts, ...localExtracts])]

  function cancelArticleDelete() {
    setPendingArticleDelete(false)
    requestAnimationFrame(() => menuTriggerRef.current?.focus())
  }

  async function handleRate(rating: 'Again' | 'Hard' | 'Good' | 'Easy') {
    if (!current || sessionControlsBusy) return
    const advanced = await runSessionAction(() =>
      reviewMutation.mutateAsync({ readingItemId: current.id, rating })
    )
    if (advanced) void utils.reading.listDue.invalidate()
  }

  function handleExtract(text: string) {
    if (!current) return
    setLocalExtracts(prev => [...prev, text])
    extractMutation.mutate({ parentItemId: current.id, selectedText: text })
  }

  function handleSaveAsNote(text: string) {
    setNoteDialog({ open: true, text, title: text.slice(0, 80).trim() })
  }

  function handleCreateFlashcard(text: string) {
    setFlashcardModal({ open: true, front: text })
  }

  function handleDeletePassage(text: string) {
    if (!current) return
    const itemId = current.id
    let previous: string[] = []
    let alreadyHidden = false
    setLocalHiddenPassages(prev => {
      previous = prev
      if (prev.includes(text)) {
        alreadyHidden = true
        return prev
      }
      return [...prev, text]
    })
    if (alreadyHidden) return

    hidePassageMutation.mutate(
      { id: itemId, text },
      {
        onError: () => {
          rollbackHiddenPassagesIfCurrent(itemId, previous)
          toast.error('Failed to hide passage')
        },
      }
    )
  }

  async function handleRestorePassages(texts: string[]) {
    if (!current || texts.length === 0) return
    const itemId = current.id
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
    } catch {
      rollbackHiddenPassagesIfCurrent(itemId, previous)
      toast.error(
        texts.length === 1 ? 'Failed to restore passage' : 'Failed to restore hidden passages'
      )
    }
  }

  function handleArchiveArticle() {
    if (!current || sessionControlsBusy) return
    void runSessionAction(() => archiveMutation.mutateAsync({ id: current.id }))
  }

  function handleConfirmDeleteArticle() {
    if (!current || sessionControlsBusy) return
    void runSessionAction(() => deleteMutation.mutateAsync({ id: current.id }))
  }

  function pushReadingItemToFront(wikiItem: ReadingItem, prevCurrent: ReadingItem | null) {
    setLocalExtracts([])
    setCurrent(wikiItem)
    setQueue(prev => {
      const withoutWiki = prev.filter(item => item.id !== wikiItem.id)
      if (prevCurrent && prevCurrent.id !== wikiItem.id) {
        const withoutPrev = withoutWiki.filter(item => item.id !== prevCurrent.id)
        return [prevCurrent, ...withoutPrev]
      }
      return withoutWiki
    })
  }

  async function handleAddWikipediaLink(url: string) {
    if (
      sessionControlsBusy ||
      sessionActionPendingRef.current ||
      advanceGuardRef.current
    ) {
      return
    }

    if (wikipediaAddInFlight(addingWikipediaUrls.current, url)) {
      toast.info('Already adding that Wikipedia article')
      return
    }

    const articleTitle = titleFromWikipediaUrl(url)
    const imported = lookupWikipediaImport(url, importedWikipediaUrls)
    const prevCurrent = current
    const capturedGeneration = sessionGenerationRef.current
    const capturedCurrentId = current?.id ?? null
    const loadingMessage = imported
      ? `Opening "${articleTitle}"...`
      : `Adding "${articleTitle}" to reading queue...`
    const toastId = toast.loading(loadingMessage)
    markWikipediaAddInFlight(addingWikipediaUrls.current, url)

    try {
      let wikiItem: ReadingItem

      if (imported) {
        if (imported.archivedAt) {
          await unarchiveMutation.mutateAsync({ id: imported.id })
        }
        wikiItem = (await utils.reading.getById.fetch({ id: imported.id })) as ReadingItem
      } else {
        const article = await utils.reading.fetchWikipedia.fetch({ url })
        wikiItem = (await addWikipediaMutation.mutateAsync(article)) as ReadingItem
      }

      invalidateLists()

      const sessionMovedOn =
        sessionGenerationRef.current !== capturedGeneration ||
        currentIdRef.current !== capturedCurrentId ||
        sessionActionPendingRef.current ||
        advanceGuardRef.current

      if (sessionMovedOn) {
        const deferredMessage = imported
          ? `"${articleTitle}" is ready in your queue`
          : `Added "${articleTitle}" to queue`
        toast.success(deferredMessage, { id: toastId })
        return
      }

      pushReadingItemToFront(wikiItem, prevCurrent)

      const successMessage = imported
        ? `Now reading "${articleTitle}"`
        : `Added "${articleTitle}" to queue`
      toast.success(successMessage, { id: toastId })
    } catch {
      const errorMessage = imported
        ? `Failed to open "${articleTitle}"`
        : `Failed to add "${articleTitle}"`
      toast.error(errorMessage, { id: toastId })
    } finally {
      clearWikipediaAddInFlight(addingWikipediaUrls.current, url)
    }
  }

  if (isLoading || !sessionReady) {
    return (
      <SessionShell>
        <p className="text-muted-foreground text-sm">Loading...</p>
      </SessionShell>
    )
  }

  if (done || !current) {
    return (
      <SessionShell>
        <div className="py-12 text-center">
          <p className="mb-2 text-lg font-medium">All caught up!</p>
          <p className="mb-4 text-muted-foreground">No more items due right now.</p>
          <Link href="/reading" className="text-sm underline">
            Back to queue
          </Link>
        </div>
      </SessionShell>
    )
  }

  return (
    <SessionShell>
      <div className="relative">
        <SelectionToolbar
          contentId="reading-content"
          onExtract={handleExtract}
          onSaveAsNote={handleSaveAsNote}
          onCreateFlashcard={handleCreateFlashcard}
          onDeletePassage={handleDeletePassage}
        />

        <div className="mb-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Badge variant="outline">
              {SOURCE_LABELS[current.sourceType] ?? current.sourceType}
            </Badge>
            <span className="text-xs text-muted-foreground">{queue.length} remaining</span>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2 shrink-0 max-w-full">
            {pendingArticleDelete ? (
              <div
                role="group"
                aria-labelledby="delete-article-label"
                aria-live="polite"
                className="flex flex-wrap items-center justify-end gap-2 max-w-full"
              >
                <span id="delete-article-label" className="text-xs text-muted-foreground">
                  Delete this article?
                </span>
                <Button
                  ref={confirmDeleteRef}
                  type="button"
                  variant="destructive"
                  size="xs"
                  disabled={sessionControlsBusy}
                  onClick={handleConfirmDeleteArticle}
                >
                  Confirm
                </Button>
                <Button type="button" variant="outline" size="xs" onClick={cancelArticleDelete}>
                  Cancel
                </Button>
              </div>
            ) : (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      ref={menuTriggerRef}
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Article actions"
                      disabled={sessionControlsBusy}
                    >
                      <MoreVertical className="size-4" />
                    </Button>
                  }
                />
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    disabled={sessionControlsBusy}
                    onClick={handleArchiveArticle}
                  >
                    <Archive />
                    Archive article
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    disabled={sessionControlsBusy}
                    onClick={() => setPendingArticleDelete(true)}
                  >
                    <Trash2 />
                    Delete article
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <Link href="/reading" className="text-xs text-muted-foreground hover:underline">
              ← Queue
            </Link>
          </div>
        </div>

        <h1 className="mb-4 text-xl font-semibold">{current.title}</h1>

        <div className="mb-8" id="reading-content">
          <ExtractHighlighter
            markdown={current.content}
            extractedTexts={extractedTexts}
            hiddenPassages={localHiddenPassages}
            importedWikipediaUrls={importedWikipediaUrls}
            onRestorePassages={handleRestorePassages}
            onAddWikipediaLink={handleAddWikipediaLink}
          />
        </div>

        <div className="border-t pt-4">
          <p className="mb-3 text-center text-xs text-muted-foreground">
            How well did you read this?
          </p>
          <RatingBar onRate={handleRate} isPending={sessionControlsBusy} />
        </div>
      </div>

      <Dialog open={noteDialog.open} onOpenChange={open => setNoteDialog(d => ({ ...d, open }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save as Note</DialogTitle>
          </DialogHeader>
          <div className="mt-2 flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor="note-title" className="text-sm font-medium">
                Title
              </label>
              <Input
                id="note-title"
                value={noteDialog.title}
                onChange={e => setNoteDialog(d => ({ ...d, title: e.target.value }))}
              />
            </div>
            <p className="line-clamp-3 text-sm text-muted-foreground">{noteDialog.text}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNoteDialog(d => ({ ...d, open: false }))}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!current || sessionControlsBusy) return
                const itemId = current.id
                const title = noteDialog.title || undefined
                const body = noteDialog.text
                setNoteDialog(d => ({ ...d, open: false }))
                void runSessionAction(() =>
                  terminateMutation.mutateAsync({
                    readingItemId: itemId,
                    title,
                    body,
                  })
                )
              }}
              disabled={sessionControlsBusy}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CardCreationModal
        open={flashcardModal.open}
        onClose={() => setFlashcardModal(d => ({ ...d, open: false }))}
        initialFront={flashcardModal.front}
        sourceReadingItemId={current.id}
      />
    </SessionShell>
  )
}
