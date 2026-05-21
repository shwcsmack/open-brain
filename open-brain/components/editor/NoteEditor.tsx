'use client'
import type { Editor, Range } from '@tiptap/core'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Fuse from 'fuse.js'
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { trpc } from '@/lib/trpc'
import { WikilinkExtension, extractWikilinks } from './extensions/WikilinkExtension'
import { TaskList, TaskItem, extractTaskItems } from './extensions/TaskItemExtension'
import { ClozeExtension, extractClozeItems } from './extensions/ClozeExtension'
import { CardCreationModal } from '@/components/flashcard/CardCreationModal'
import { WikilinkAutocomplete, type WikilinkAutocompleteNote } from './WikilinkAutocomplete'

interface Props {
  noteId: string
  initialContent: string
  notes: WikilinkAutocompleteNote[]
  onSave?: (content: string) => void
}

interface SearchableNote extends WikilinkAutocompleteNote {
  tagList: string[]
}

interface WikilinkSuggestionState {
  rect: DOMRect
  items: WikilinkAutocompleteNote[]
  range: Range
  selectedIndex: number
}

interface ActiveWikilinkSuggestion {
  rect: DOMRect
  query: string
  range: Range
}

export interface NoteEditorHandle {
  save: () => void
}

function parseTags(tags: string): string[] {
  try {
    const parsed = JSON.parse(tags)
    return Array.isArray(parsed) ? parsed.filter((tag): tag is string => typeof tag === 'string') : []
  } catch {
    return []
  }
}

export const NoteEditor = forwardRef<NoteEditorHandle, Props>(function NoteEditor({ noteId, initialContent, notes, onSave }, ref) {
  const update = trpc.note.update.useMutation({
    onError: () => toast.error('Failed to save note'),
  })
  const syncLinks = trpc.noteLink.sync.useMutation()
  const syncTasks = trpc.task.syncFromNote.useMutation()
  const syncCloze = trpc.flashcard.syncCloze.useMutation()
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const editorRef = useRef<ReturnType<typeof useEditor>>(null)
  const suggestionStateRef = useRef<WikilinkSuggestionState | null>(null)
  const suggestionRangeRef = useRef<Range | null>(null)

  const [cardModalOpen, setCardModalOpen] = useState(false)
  const [cardModalFront, setCardModalFront] = useState('')
  const [suggestionState, setSuggestionState] = useState<WikilinkSuggestionState | null>(null)
  const searchableNotes = useMemo<SearchableNote[]>(
    () => notes.map((note) => ({ ...note, tagList: parseTags(note.tags) })),
    [notes]
  )
  // tagList is the parsed string[] form of the raw tags JSON string — Fuse.js can't rank a JSON string
  const fuse = useMemo(
    () =>
      new Fuse(searchableNotes, {
        keys: [
          { name: 'title', weight: 0.8 },
          { name: 'tagList', weight: 0.2 },
        ],
        threshold: 0.4,
        includeScore: true,
        minMatchCharLength: 1,
      }),
    [searchableNotes]
  )
  const fuseRef = useRef(fuse)

  useEffect(() => {
    fuseRef.current = fuse
  }, [fuse])

  function updateSuggestionState(
    next:
      | WikilinkSuggestionState
      | null
      | ((current: WikilinkSuggestionState | null) => WikilinkSuggestionState | null)
  ) {
    const resolved = typeof next === 'function' ? next(suggestionStateRef.current) : next
    suggestionStateRef.current = resolved
    setSuggestionState(resolved)
  }

  function searchNotes(query: string): WikilinkAutocompleteNote[] {
    const trimmed = query.trim()
    if (!trimmed) return []

    return fuseRef.current.search(trimmed, { limit: 10 }).map((result) => result.item)
  }

  function insertWikilink(note: WikilinkAutocompleteNote, range: Range | null = suggestionRangeRef.current) {
    const ed = editorRef.current
    if (!ed || !range) return

    ed.chain()
      .focus()
      .insertContentAt(range, {
        type: 'wikilink',
        attrs: {
          noteId: note.id,
          noteSlug: note.slug,
          title: note.title,
          resolved: true,
        },
      })
      .run()

    suggestionRangeRef.current = null
    updateSuggestionState(null)
  }

  function getActiveWikilinkSuggestion(ed: Editor): ActiveWikilinkSuggestion | null {
    const { selection } = ed.state
    if (!selection.empty) return null

    const { $from } = selection
    const textBeforeCursor = $from.parent.textBetween(0, $from.parentOffset, '\n', '\ufffc')
    const match = /(?:^|[\s([{])(\[\[([^\]\n]*))$/.exec(textBeforeCursor)

    if (!match) return null

    const triggerText = match[1]
    const query = match[2]
    if (!query) return null

    try {
      const coords = ed.view.coordsAtPos(selection.from)
      return {
        rect: new DOMRect(coords.left, coords.top, coords.right - coords.left, coords.bottom - coords.top),
        query,
        range: {
          from: selection.from - triggerText.length,
          to: selection.from,
        },
      }
    } catch {
      return null
    }
  }

  function refreshWikilinkSuggestion(ed: Editor) {
    const activeSuggestion = getActiveWikilinkSuggestion(ed)

    if (!activeSuggestion) {
      suggestionRangeRef.current = null
      updateSuggestionState(null)
      return
    }

    suggestionRangeRef.current = activeSuggestion.range
    updateSuggestionState({
      rect: activeSuggestion.rect,
      items: searchNotes(activeSuggestion.query),
      range: activeSuggestion.range,
      selectedIndex: 0,
    })
  }

  useImperativeHandle(ref, () => ({
    save() {
      const ed = editorRef.current
      if (!ed) return
      clearTimeout(saveTimer.current)
      const body = JSON.stringify(ed.getJSON())
      update.mutate({ id: noteId, body })
      onSave?.(body)
      const links = extractWikilinks(ed.getJSON())
      syncLinks.mutate({ sourceNoteId: noteId, targetNoteIds: links })
      const taskItems = extractTaskItems(ed.getJSON())
      if (taskItems.length > 0) syncTasks.mutate({ noteId, tasks: taskItems })
      const clozeItems = extractClozeItems(ed.getJSON() as Record<string, unknown>)
      syncCloze.mutate({ noteId, items: clozeItems.map(c => ({ front: c.front, clozeIndex: c.clozeIndex, answer: c.answer })) })
    },
  }))

  const editor = useEditor({
    extensions: [
      StarterKit,
      WikilinkExtension,
      TaskList,
      TaskItem.configure({ nested: false }),
      ClozeExtension,
    ],
    content: initialContent ? JSON.parse(initialContent) : '',
    onUpdate: ({ editor }) => {
      refreshWikilinkSuggestion(editor)
      clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        const body = JSON.stringify(editor.getJSON())
        update.mutate({ id: noteId, body })
        onSave?.(body)
        const links = extractWikilinks(editor.getJSON())
        syncLinks.mutate({ sourceNoteId: noteId, targetNoteIds: links })
        const taskItems = extractTaskItems(editor.getJSON())
        if (taskItems.length > 0) {
          syncTasks.mutate({ noteId, tasks: taskItems })
        }
        const clozeItems = extractClozeItems(editor.getJSON() as Record<string, unknown>)
        syncCloze.mutate({
          noteId,
          items: clozeItems.map((c) => ({ front: c.front, clozeIndex: c.clozeIndex, answer: c.answer })),
        })
      }, 1000)
    },
  })

  // ⌘⇧F shortcut: open card creation modal with selected text
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const currentSuggestion = suggestionStateRef.current

      if (editor?.isFocused && currentSuggestion) {
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          updateSuggestionState((state) =>
            state && state.items.length > 0
              ? { ...state, selectedIndex: (state.selectedIndex + 1) % state.items.length }
              : state
          )
          return
        }

        if (e.key === 'ArrowUp') {
          e.preventDefault()
          updateSuggestionState((state) =>
            state && state.items.length > 0
              ? { ...state, selectedIndex: (state.selectedIndex - 1 + state.items.length) % state.items.length }
              : state
          )
          return
        }

        if (e.key === 'Enter') {
          const note = currentSuggestion.items[currentSuggestion.selectedIndex]
          if (note) {
            e.preventDefault()
            insertWikilink(note, currentSuggestion.range)
          }
          return
        }

        if (e.key === 'Escape' || e.key === 'Esc') {
          e.preventDefault()
          suggestionRangeRef.current = null
          updateSuggestionState(null)
          return
        }
      }

      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        const selection = editor?.state.selection
        const selectedText = editor?.state.doc.textBetween(
          selection?.from ?? 0,
          selection?.to ?? 0
        )
        if (selectedText) {
          setCardModalFront(selectedText)
          setCardModalOpen(true)
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown, true)
    return () => document.removeEventListener('keydown', handleKeyDown, true)
  }, [editor])

  useEffect(() => {
    editorRef.current = editor
  }, [editor])

  useEffect(() => () => clearTimeout(saveTimer.current), [])

  return (
    <>
      <div className="prose prose-sm max-w-none">
        <EditorContent editor={editor} />
      </div>
      {suggestionState ? (
        <WikilinkAutocomplete
          items={suggestionState.items}
          selectedIndex={suggestionState.selectedIndex}
          rect={suggestionState.rect}
          onSelect={(note) => insertWikilink(note)}
        />
      ) : null}
      <CardCreationModal
        open={cardModalOpen}
        onClose={() => setCardModalOpen(false)}
        noteId={noteId}
        initialFront={cardModalFront}
      />
    </>
  )
})
