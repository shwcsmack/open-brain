'use client'
import { use, useState } from 'react'
import { useRouter } from 'next/navigation'
import { trpc } from '@/lib/trpc'
import { NoteEditor } from '@/components/editor/NoteEditor'
import { TagInput } from '@/components/notes/TagInput'
import { BacklinksPanel } from '@/components/notes/BacklinksPanel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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

export default function NotePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  const router = useRouter()
  const utils = trpc.useUtils()
  const { data: note } = trpc.note.getBySlug.useQuery({ slug })
  const update = trpc.note.update.useMutation({
    onSuccess: () => utils.note.list.invalidate(),
  })
  const del = trpc.note.delete.useMutation({
    onSuccess: () => router.push('/'),
  })

  if (!note) return <div className="p-6 text-muted-foreground">Loading...</div>

  let tags: string[] = []
  try { tags = JSON.parse(note.tags) } catch { /* noop */ }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-2 mb-4">
        <Input
          className="text-2xl font-bold border-0 shadow-none px-0 h-auto flex-1"
          defaultValue={note.title}
          onBlur={e => {
            if (e.target.value !== note.title) {
              update.mutate({ id: note.id, title: e.target.value })
            }
          }}
        />
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
              <AlertDialogAction onClick={() => del.mutate({ id: note.id })}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      <TagInput
        tags={tags}
        onChange={t => update.mutate({ id: note.id, tags: JSON.stringify(t) })}
      />
      <div className="mt-4">
        <NoteEditor noteId={note.id} initialContent={note.body} />
      </div>
      <div className="mt-8 border-t">
        <BacklinksPanel noteId={note.id} />
      </div>
    </div>
  )
}
