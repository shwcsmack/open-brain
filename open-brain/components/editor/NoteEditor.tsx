'use client'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { trpc } from '@/lib/trpc'
import { WikilinkExtension, extractWikilinks } from './extensions/WikilinkExtension'
import { TaskList, TaskItem, extractTaskItems } from './extensions/TaskItemExtension'
import { ClozeExtension, extractClozeItems } from './extensions/ClozeExtension'
import { CardCreationModal } from '@/components/flashcard/CardCreationModal'

interface Props {
  noteId: string
  initialContent: string
  onSave?: (content: string) => void
}

export function NoteEditor({ noteId, initialContent, onSave }: Props) {
  const update = trpc.note.update.useMutation({
    onError: () => toast.error('Failed to save note'),
  })
  const syncLinks = trpc.noteLink.sync.useMutation()
  const syncTasks = trpc.task.syncFromNote.useMutation()
  const syncCloze = trpc.flashcard.syncCloze.useMutation()
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const [cardModalOpen, setCardModalOpen] = useState(false)
  const [cardModalFront, setCardModalFront] = useState('')

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
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [editor])

  useEffect(() => () => clearTimeout(saveTimer.current), [])

  return (
    <>
      <div className="prose prose-sm max-w-none">
        <EditorContent editor={editor} />
      </div>
      <CardCreationModal
        open={cardModalOpen}
        onClose={() => setCardModalOpen(false)}
        noteId={noteId}
        initialFront={cardModalFront}
      />
    </>
  )
}
