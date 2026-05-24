'use client'
import { use, useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { trpc } from '@/lib/trpc'
import { NoteViewer } from '@/components/editor/NoteViewer'
import {
  NoteMarkdownEditor,
  type AutocompleteNote,
} from '@/components/editor/NoteMarkdownEditor'
import { TagInput } from '@/components/notes/TagInput'
import { BacklinksPanel } from '@/components/notes/BacklinksPanel'
import { CardsPanel } from '@/components/flashcard/CardsPanel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { ChevronLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

type Mode = 'view' | 'edit'

const AUTOSAVE_DEBOUNCE_MS = 1000

export default function NotePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  const router = useRouter()
  const utils = trpc.useUtils()
  const titleRef = useRef<HTMLInputElement>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const [mode, setMode] = useState<Mode>('view')
  const [bodyValue, setBodyValue] = useState('')
  // Tracks which note id `bodyValue` was hydrated for. Guards against an
  // earlier note's body bleeding into a newly-loaded note while still allowing
  // a clean re-hydration when the user navigates between notes.
  const [hydratedNoteId, setHydratedNoteId] = useState<string | null>(null)

  // FIFO queue tail for body-bearing save requests. Cancelling the debounce
  // timer guarantees no NEW autosave fires for an outdated body, but an
  // autosave that already left the page can still be in flight on the network.
  // Without ordering, a slow earlier autosave could land AFTER a later
  // Edit→View / explicit save and overwrite newer content. Chaining every
  // body save onto this promise serializes the writes: save B's `mutateAsync`
  // is not even invoked until save A settles, so the server receives them in
  // the same order they were issued. Errors are swallowed for the chain so a
  // transient failure does not wedge subsequent saves (the failing mutation
  // still surfaces a toast via its `onError`).
  const pendingSaveRef = useRef<Promise<unknown>>(Promise.resolve())

  const { data: note, isLoading } = trpc.note.getBySlug.useQuery({ slug })
  const { data: notes = [] } = trpc.note.list.useQuery(undefined, { refetchInterval: 30000 })
  const { data: queuedForNote = [] } = trpc.reading.listAll.useQuery(
    { sourceNoteId: note?.id },
    { enabled: !!note?.id }
  )
  const addToReadingQueue = trpc.reading.addNote.useMutation({
    onSuccess: () => {
      toast.success('Added to reading queue')
      utils.reading.listAll.invalidate()
      utils.reading.listDue.invalidate()
    },
    onError: () => toast.error('Failed to add to reading queue'),
  })

  // Explicit Save / metadata edits surface a toast; auto-save is silent so the
  // user isn't carpet-bombed with "Note saved" every second while typing.
  // Derived sync (wikilinks, tasks, cloze) lives in the `note.update` handler
  // so the page can stay focused on note body/title/tag state and not race
  // with router-side extraction against a stale client notes list.
  const updateMutation = trpc.note.update.useMutation({
    onSuccess: () => {
      utils.note.list.invalidate()
      toast.success('Note saved')
    },
    onError: () => toast.error('Failed to save note'),
  })
  const autoSaveMutation = trpc.note.update.useMutation({
    onSuccess: () => utils.note.list.invalidate(),
    onError: () => toast.error('Failed to save note'),
  })
  const del = trpc.note.delete.useMutation({
    onSuccess: () => router.push('/'),
  })

  const cancelPendingAutoSave = useCallback(() => {
    if (saveTimerRef.current !== undefined) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = undefined
    }
  }, [])

  const enqueueBodySave = useCallback(
    (run: () => Promise<unknown>): Promise<unknown> => {
      const next = pendingSaveRef.current.catch(() => undefined).then(run)
      pendingSaveRef.current = next.catch(() => undefined)
      return next
    },
    [],
  )

  // Re-hydrate local state whenever the loaded note's id changes — covers both
  // first load and the rare in-place navigation case where this component
  // receives a fresh note without unmounting. Cancels any pending debounce
  // from the prior note so a stale body cannot be saved against the new id.
  useEffect(() => {
    if (!note) return
    if (hydratedNoteId === note.id) return
    cancelPendingAutoSave()
    setBodyValue(note.body ?? '')
    setMode('view')
    setHydratedNoteId(note.id)
  }, [note, hydratedNoteId, cancelPendingAutoSave])

  function handleBodyChange(next: string) {
    setBodyValue(next)
    if (!note) return
    const noteId = note.id
    cancelPendingAutoSave()
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = undefined
      void enqueueBodySave(() =>
        autoSaveMutation.mutateAsync({ id: noteId, body: next }),
      )
    }, AUTOSAVE_DEBOUNCE_MS)
  }

  function handleExplicitSave() {
    if (!note) return
    cancelPendingAutoSave()
    const currentTitle = titleRef.current?.value
    const titleChanged =
      typeof currentTitle === 'string' && currentTitle !== note.title
    void enqueueBodySave(() =>
      updateMutation.mutateAsync({
        id: note.id,
        body: bodyValue,
        ...(titleChanged ? { title: currentTitle } : {}),
      }),
    )
  }

  function handleModeSwitch(next: Mode) {
    if (next === mode) return
    // Edit → View: cancel pending debounce and enqueue exactly one immediate
    // save. Silent (autosave-style) so the mode switch feels like a passive
    // transition rather than a confirmation moment. Queueing — not just
    // cancelling the debounce — is what guarantees that an earlier in-flight
    // autosave can never overwrite this newer body on the server.
    if (mode === 'edit' && next === 'view' && note) {
      cancelPendingAutoSave()
      void enqueueBodySave(() =>
        autoSaveMutation.mutateAsync({ id: note.id, body: bodyValue }),
      )
    }
    setMode(next)
  }

  useEffect(() => () => cancelPendingAutoSave(), [cancelPendingAutoSave])

  if (isLoading) return <NotePageSkeleton />
  if (!note) return <div className="p-6 text-muted-foreground">Note not found.</div>
  // Wait for hydration before mounting NoteViewer / NoteMarkdownEditor so the
  // editor never sees the previous note's body even for a single frame.
  if (hydratedNoteId !== note.id) return <NotePageSkeleton />

  let tags: string[] = []
  try {
    tags = JSON.parse(note.tags)
  } catch {
    /* noop */
  }

  const isQueued = queuedForNote.length > 0

  const autocompleteNotes: AutocompleteNote[] = notes.map(
    ({ id, title, slug: noteSlug, tags }) => ({
      id,
      title,
      slug: noteSlug,
      tags,
    }),
  )

  return (
    <div className="flex min-h-screen">
      <div className="flex-1 p-6 max-w-3xl">
        <div className="flex items-center gap-2 mb-2">
          <Link href="/">
            <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground">
              <ChevronLeft className="h-4 w-4" />
              Notes
            </Button>
          </Link>
        </div>
        <div className="flex items-center gap-2 mb-4">
          <Input
            ref={titleRef}
            key={note.id}
            className="text-2xl font-bold border-0 shadow-none px-0 h-auto flex-1"
            defaultValue={note.title}
          />
          <ModeToggle mode={mode} onChange={handleModeSwitch} />
          <Button size="sm" onClick={handleExplicitSave} disabled={updateMutation.isPending}>
            {updateMutation.isPending ? 'Saving…' : 'Save'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={isQueued || addToReadingQueue.isPending}
            onClick={() => addToReadingQueue.mutate({ noteId: note.id })}
          >
            {isQueued ? 'In reading queue' : 'Add to reading queue'}
          </Button>
          <Link href={`/graph?focus=${note.id}`}>
            <Button variant="outline" size="sm">
              Graph
            </Button>
          </Link>
          <AlertDialog>
            <AlertDialogTrigger render={<Button variant="destructive" size="sm" />}>
              Delete
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete note?</AlertDialogTitle>
                <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => del.mutate({ id: note.id })}>
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
        <TagInput
          tags={tags}
          onChange={(t) => updateMutation.mutate({ id: note.id, tags: JSON.stringify(t) })}
        />
        <div className="mt-4">
          {mode === 'view' ? (
            <NoteViewer markdown={bodyValue} />
          ) : (
            <NoteMarkdownEditor
              value={bodyValue}
              onChange={handleBodyChange}
              notes={autocompleteNotes}
            />
          )}
        </div>
      </div>

      <div className="w-72 shrink-0 border-l flex flex-col divide-y">
        <BacklinksPanel noteId={note.id} />
        <CardsPanel noteId={note.id} />
      </div>
    </div>
  )
}

interface ModeToggleProps {
  mode: Mode
  onChange: (next: Mode) => void
}

function ModeToggle({ mode, onChange }: ModeToggleProps) {
  return (
    <div
      role="group"
      aria-label="Note display mode"
      className="inline-flex items-center rounded-md border bg-background p-0.5 text-sm shrink-0"
    >
      <ModeSegment active={mode === 'view'} onClick={() => onChange('view')}>
        View
      </ModeSegment>
      <ModeSegment active={mode === 'edit'} onClick={() => onChange('edit')}>
        Edit
      </ModeSegment>
    </div>
  )
}

interface ModeSegmentProps {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}

function ModeSegment({ active, onClick, children }: ModeSegmentProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'h-7 px-3 rounded-sm text-sm transition-colors outline-none',
        active
          ? 'bg-accent text-accent-foreground font-medium'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}

function NotePageSkeleton() {
  return (
    <div className="flex min-h-screen">
      <div className="flex-1 p-6 max-w-3xl">
        <Skeleton className="h-10 w-3/4 mb-4" />
        <Skeleton className="h-6 w-1/4 mb-6" />
        <div className="space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </div>
    </div>
  )
}
