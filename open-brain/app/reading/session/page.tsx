'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { trpc } from '@/lib/trpc'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ExtractHighlighter } from '@/components/reading/ExtractHighlighter'
import { RatingBar } from '@/components/reading/RatingBar'
import { SelectionToolbar } from '@/components/reading/SelectionToolbar'
import { CardCreationModal } from '@/components/flashcard/CardCreationModal'

const SOURCE_LABELS: Record<string, string> = {
  NOTE: 'Note',
  URL: 'URL',
  WIKIPEDIA_SECTION: 'Wikipedia',
  EXTRACT: 'Extract',
}

type ReadingItem = {
  id: string
  title: string
  content: string
  sourceType: string
  extractedText: string | null
  parentItemId: string | null
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
  const utils = trpc.useUtils()
  const { data: dueItems, isLoading } = trpc.reading.listDue.useQuery(undefined, {
    refetchInterval: 30000,
  })

  const [queue, setQueue] = useState<ReadingItem[]>([])
  const [current, setCurrent] = useState<ReadingItem | null>(null)
  const [done, setDone] = useState(false)
  const [initialized, setInitialized] = useState(false)
  const [localExtracts, setLocalExtracts] = useState<string[]>([])
  const addingWikipediaUrls = useRef(new Set<string>())

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
      advance()
    },
    onError: () => toast.error('Failed to save note'),
  })
  const addWikipediaMutation = trpc.reading.addWikipedia.useMutation({
    onSuccess: () => {
      utils.reading.listDue.invalidate()
      utils.reading.listAll.invalidate()
    },
  })

  useEffect(() => {
    if (dueItems && !initialized) {
      setInitialized(true)
      const items = dueItems as ReadingItem[]
      setQueue(items.slice(1))
      setCurrent(items[0] ?? null)
      if (items.length === 0) setDone(true)
    }
  }, [dueItems, initialized])

  const serverExtracts = childItems
    .filter(item => item.extractedText)
    .map(item => item.extractedText as string)
  const extractedTexts = [...new Set([...serverExtracts, ...localExtracts])]

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

  async function handleRate(rating: 'Again' | 'Hard' | 'Good' | 'Easy') {
    if (!current || reviewMutation.isPending) return
    await reviewMutation.mutateAsync({ readingItemId: current.id, rating })
    utils.reading.listDue.invalidate()
    advance()
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

  async function handleAddWikipediaLink(url: string) {
    if (addingWikipediaUrls.current.has(url)) {
      toast.info('Already adding that Wikipedia article')
      return
    }
    const articleTitle = titleFromWikipediaUrl(url)
    const toastId = toast.loading(`Adding "${articleTitle}" to reading queue...`)
    addingWikipediaUrls.current.add(url)
    try {
      const sections = await utils.reading.fetchWikipedia.fetch({ url })
      const items = await addWikipediaMutation.mutateAsync(
        sections.map(s => ({
          title: s.title,
          content: s.content,
          articleUrl: s.articleUrl,
          sectionTitle: s.sectionTitle,
        }))
      )
      toast.success(`Added "${articleTitle}" (${items.length} sections) to queue`, { id: toastId })
    } catch {
      toast.error(`Failed to add "${articleTitle}"`, { id: toastId })
    } finally {
      addingWikipediaUrls.current.delete(url)
    }
  }

  if (isLoading || !initialized) {
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
        />

        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge variant="outline">
              {SOURCE_LABELS[current.sourceType] ?? current.sourceType}
            </Badge>
            <span className="text-xs text-muted-foreground">{queue.length} remaining</span>
          </div>
          <Link href="/reading" className="text-xs text-muted-foreground hover:underline">
            ← Queue
          </Link>
        </div>

        <h1 className="mb-4 text-xl font-semibold">{current.title}</h1>

        <div className="mb-8" id="reading-content">
          <ExtractHighlighter
            markdown={current.content}
            extractedTexts={extractedTexts}
            onAddWikipediaLink={handleAddWikipediaLink}
          />
        </div>

        <div className="border-t pt-4">
          <p className="mb-3 text-center text-xs text-muted-foreground">
            How well did you read this?
          </p>
          <RatingBar onRate={handleRate} isPending={reviewMutation.isPending} />
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
                if (!current) return
                setNoteDialog(d => ({ ...d, open: false }))
                terminateMutation.mutate({
                  readingItemId: current.id,
                  title: noteDialog.title || undefined,
                  body: noteDialog.text,
                })
              }}
              disabled={terminateMutation.isPending}
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
