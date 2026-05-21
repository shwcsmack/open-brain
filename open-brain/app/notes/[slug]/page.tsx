'use client'
import { use, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { trpc } from '@/lib/trpc'
import { NoteEditor } from '@/components/editor/NoteEditor'
import { TagInput } from '@/components/notes/TagInput'
import { BacklinksPanel } from '@/components/notes/BacklinksPanel'
import { CardsPanel } from '@/components/flashcard/CardsPanel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
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
  const { data: note, isLoading } = trpc.note.getBySlug.useQuery({ slug })
  const update = trpc.note.update.useMutation({
    onSuccess: () => utils.note.list.invalidate(),
    onError: () => toast.error('Failed to save note'),
  })
  const del = trpc.note.delete.useMutation({
    onSuccess: () => router.push('/'),
  })

  if (isLoading) return (
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

  if (!note) return <div className="p-6 text-muted-foreground">Note not found.</div>

  let tags: string[] = []
  try { tags = JSON.parse(note.tags) } catch { /* noop */ }

  return (
    <div className="flex min-h-screen">
      {/* Main content */}
      <div className="flex-1 p-6 max-w-3xl">
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
          <Link href={`/graph?focus=${note.id}`}>
            <Button variant="outline" size="sm">Graph</Button>
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
      </div>

      {/* Right sidebar */}
      <div className="w-72 shrink-0 border-l flex flex-col divide-y">
        <BacklinksPanel noteId={note.id} />
        <CardsPanel noteId={note.id} />
      </div>
    </div>
  )
}
