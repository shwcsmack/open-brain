'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { trpc } from '@/lib/trpc'
import { NoteViewer } from '@/components/editor/NoteViewer'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'

function isEnWikipediaUrl(raw: string): boolean {
  try {
    const u = new URL(raw.trim())
    return u.hostname === 'en.wikipedia.org'
  } catch {
    return false
  }
}

function trpcErrorMessage(err: { message?: string } | null | undefined): string {
  return err?.message?.trim() || 'Something went wrong. Try again.'
}

type WikipediaSection = {
  title: string
  content: string
  articleUrl: string
  sectionTitle: string
}

export default function ReadingAddPage() {
  const router = useRouter()
  const utils = trpc.useUtils()

  const [urlInput, setUrlInput] = useState('')
  const [submittedUrl, setSubmittedUrl] = useState<string | null>(null)
  const [selectedSectionIndexes, setSelectedSectionIndexes] = useState<Set<number>>(new Set())
  const [showManualPaste, setShowManualPaste] = useState(false)
  const [manualTitle, setManualTitle] = useState('')
  const [manualContent, setManualContent] = useState('')

  const [noteQuery, setNoteQuery] = useState('')
  const [pickedNoteId, setPickedNoteId] = useState<string | null>(null)

  const isWikiFetch = submittedUrl !== null && isEnWikipediaUrl(submittedUrl)

  const wikiQuery = trpc.reading.fetchWikipedia.useQuery(
    { url: submittedUrl! },
    { enabled: isWikiFetch, retry: false }
  )

  const urlPreviewQuery = trpc.reading.previewUrl.useQuery(
    { url: submittedUrl! },
    { enabled: submittedUrl !== null && !isWikiFetch, retry: false }
  )

  const activeQuery = isWikiFetch ? wikiQuery : urlPreviewQuery
  const isFetching = submittedUrl !== null && activeQuery.isFetching
  const fetchError = submittedUrl !== null && activeQuery.isError ? activeQuery.error : null
  const wikiSections = wikiQuery.data ?? []
  const urlPreview = urlPreviewQuery.data

  const addWikipedia = trpc.reading.addWikipedia.useMutation({
    onSuccess: () => {
      void utils.reading.listDue.invalidate()
      void utils.reading.listAll.invalidate()
      router.push('/reading')
    },
    onError: err => toast.error(trpcErrorMessage(err)),
  })

  const addUrl = trpc.reading.addUrl.useMutation({
    onSuccess: () => {
      void utils.reading.listDue.invalidate()
      void utils.reading.listAll.invalidate()
      router.push('/reading')
    },
    onError: err => toast.error(trpcErrorMessage(err)),
  })

  const addNote = trpc.reading.addNote.useMutation({
    onSuccess: () => {
      void utils.reading.listDue.invalidate()
      void utils.reading.listAll.invalidate()
      router.push('/reading')
    },
    onError: err => toast.error(trpcErrorMessage(err)),
  })

  const { data: noteMatches = [] } = trpc.note.searchTitles.useQuery(
    { q: noteQuery.trim() },
    { enabled: noteQuery.trim().length > 0 }
  )

  function clearManualPaste() {
    setShowManualPaste(false)
    setManualTitle('')
    setManualContent('')
  }

  function resetUrlFlow() {
    setSubmittedUrl(null)
    setSelectedSectionIndexes(new Set())
    clearManualPaste()
  }

  function handleUrlSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = urlInput.trim()
    if (!trimmed) return
    try {
      new URL(trimmed)
    } catch {
      toast.error('Enter a valid URL')
      return
    }
    clearManualPaste()
    setSelectedSectionIndexes(new Set())
    setSubmittedUrl(trimmed)
  }

  function toggleSection(index: number) {
    setSelectedSectionIndexes(prev => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  function handleAddWikipediaSections() {
    const selected = wikiSections.filter((_, i) => selectedSectionIndexes.has(i))
    if (selected.length === 0) {
      toast.error('Select at least one section')
      return
    }
    addWikipedia.mutate(
      selected.map(s => ({
        title: s.title,
        content: s.content,
        articleUrl: s.articleUrl,
        sectionTitle: s.sectionTitle,
      }))
    )
  }

  function handleConfirmUrlPreview() {
    if (!submittedUrl || !urlPreview) return
    addUrl.mutate({
      url: submittedUrl,
      title: urlPreview.title,
      content: urlPreview.content,
    })
  }

  function handleManualUrlAdd() {
    if (!submittedUrl) return
    const content = manualContent.trim()
    if (!content) {
      toast.error('Paste some content first')
      return
    }
    addUrl.mutate({
      url: submittedUrl,
      title: manualTitle.trim() || undefined,
      content,
    })
  }

  const showWikiChecklist =
    isWikiFetch && !isFetching && !fetchError && wikiSections.length > 0
  const showUrlPreview =
    !isWikiFetch && !isFetching && !fetchError && urlPreview !== undefined

  useEffect(() => {
    if (showUrlPreview) clearManualPaste()
  }, [showUrlPreview])

  const showManualPastePanel =
    showManualPaste && !showUrlPreview && submittedUrl !== null && !isWikiFetch

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
          <Link href="/settings" className="text-sm font-medium px-2 py-1.5 rounded hover:bg-accent">
            Settings
          </Link>
        </nav>
      </aside>

      <main className="flex-1 p-6 max-w-3xl flex flex-col gap-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Add to reading queue</h1>
          <Link href="/reading">
            <Button variant="outline" size="sm">
              Back
            </Button>
          </Link>
        </div>

        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold">From URL</h2>
          <form onSubmit={handleUrlSubmit} className="flex flex-col gap-3">
            <Input
              type="url"
              placeholder="https://en.wikipedia.org/wiki/..."
              value={urlInput}
              onChange={e => setUrlInput(e.target.value)}
              disabled={isFetching || addWikipedia.isPending || addUrl.isPending}
            />
            <div className="flex gap-2">
              <Button type="submit" disabled={!urlInput.trim() || isFetching}>
                Fetch preview
              </Button>
              {submittedUrl && (
                <Button type="button" variant="outline" onClick={resetUrlFlow}>
                  Clear
                </Button>
              )}
            </div>
          </form>

          {isFetching && (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          )}

          {fetchError && (
            <div
              className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 flex flex-col gap-3"
              role="alert"
            >
              <p className="text-sm text-destructive">{trpcErrorMessage(fetchError)}</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    clearManualPaste()
                    void activeQuery.refetch()
                  }}
                >
                  Retry
                </Button>
                {!isWikiFetch && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowManualPaste(true)}
                  >
                    Paste content manually
                  </Button>
                )}
              </div>
            </div>
          )}

          {showManualPastePanel && (
            <div className="flex flex-col gap-3 rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">
                Import failed for{' '}
                <span className="font-medium text-foreground">{submittedUrl}</span>. Paste the
                article text below.
              </p>
              <Input
                placeholder="Title (optional)"
                value={manualTitle}
                onChange={e => setManualTitle(e.target.value)}
              />
              <textarea
                className="min-h-40 w-full rounded-md border bg-background px-3 py-2 text-sm"
                placeholder="Paste markdown or plain text..."
                value={manualContent}
                onChange={e => setManualContent(e.target.value)}
              />
              <Button
                onClick={handleManualUrlAdd}
                disabled={addUrl.isPending || !manualContent.trim()}
              >
                Add to queue
              </Button>
            </div>
          )}

          {showWikiChecklist && (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">
                Select sections from{' '}
                <span className="text-foreground font-medium">{submittedUrl}</span>
              </p>
              <div className="flex flex-col gap-2">
                {(wikiSections as WikipediaSection[]).map((section, index) => {
                  const checkboxId = `wiki-section-${index}`
                  return (
                    <div
                      key={`${section.sectionTitle}-${index}`}
                      className="flex gap-3 p-3 rounded-lg border hover:bg-accent/30"
                    >
                      <input
                        id={checkboxId}
                        type="checkbox"
                        className="mt-1 shrink-0"
                        checked={selectedSectionIndexes.has(index)}
                        onChange={() => toggleSection(index)}
                      />
                      <div className="flex flex-col gap-2 min-w-0 flex-1">
                        <label
                          htmlFor={checkboxId}
                          className="text-sm font-medium cursor-pointer"
                        >
                          {section.sectionTitle}
                        </label>
                        <details className="text-sm">
                          <summary className="text-muted-foreground cursor-pointer select-none">
                            Preview content
                          </summary>
                          <div className="mt-2 max-h-40 overflow-y-auto rounded border p-2 bg-muted/30">
                            <NoteViewer markdown={section.content} />
                          </div>
                        </details>
                      </div>
                    </div>
                  )
                })}
              </div>
              <Button
                onClick={handleAddWikipediaSections}
                disabled={addWikipedia.isPending || selectedSectionIndexes.size === 0}
              >
                Add to queue
              </Button>
            </div>
          )}

          {showUrlPreview && (
            <div className="flex flex-col gap-4">
              <div>
                <h3 className="text-lg font-semibold">{urlPreview.title}</h3>
                <p className="text-xs text-muted-foreground mt-1">{submittedUrl}</p>
              </div>
              <div className="rounded-lg border p-4 max-h-96 overflow-y-auto">
                <NoteViewer markdown={urlPreview.content} />
              </div>
              <Button onClick={handleConfirmUrlPreview} disabled={addUrl.isPending}>
                Add to queue
              </Button>
            </div>
          )}
        </section>

        <Separator />

        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold">From existing note</h2>
          <Input
            placeholder="Search notes by title..."
            value={noteQuery}
            onChange={e => {
              setNoteQuery(e.target.value)
              setPickedNoteId(null)
            }}
          />
          {noteQuery.trim().length > 0 && (
            <ul className="flex flex-col gap-1 border rounded-lg overflow-hidden">
              {noteMatches.length === 0 && (
                <li className="px-3 py-2 text-sm text-muted-foreground">No matching notes</li>
              )}
              {noteMatches.map(note => (
                <li key={note.id}>
                  <button
                    type="button"
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-accent/50 ${
                      pickedNoteId === note.id ? 'bg-accent' : ''
                    }`}
                    onClick={() => setPickedNoteId(note.id)}
                  >
                    {note.title}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <Button
            disabled={!pickedNoteId || addNote.isPending}
            onClick={() => pickedNoteId && addNote.mutate({ noteId: pickedNoteId })}
          >
            Add note to queue
          </Button>
        </section>
      </main>
    </div>
  )
}
