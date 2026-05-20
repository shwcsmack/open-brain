'use client'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { useEffect, useRef } from 'react'
import { trpc } from '@/lib/trpc'

interface Props {
  noteId: string
  initialContent: string
  onSave?: (content: string) => void
}

export function NoteEditor({ noteId, initialContent, onSave }: Props) {
  const update = trpc.note.update.useMutation()
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const editor = useEditor({
    extensions: [StarterKit],
    content: initialContent ? JSON.parse(initialContent) : '',
    onUpdate: ({ editor }) => {
      clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        const body = JSON.stringify(editor.getJSON())
        update.mutate({ id: noteId, body })
        onSave?.(body)
      }, 1000)
    },
  })

  useEffect(() => () => clearTimeout(saveTimer.current), [])

  return (
    <div className="prose prose-sm max-w-none">
      <EditorContent editor={editor} />
    </div>
  )
}
