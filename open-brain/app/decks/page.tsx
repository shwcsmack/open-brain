'use client'
import { useState } from 'react'
import Link from 'next/link'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog'
import { CardCreationModal } from '@/components/flashcard/CardCreationModal'

export default function DecksPage() {
  const utils = trpc.useUtils()
  const { data: decks } = trpc.deck.list.useQuery()
  const create = trpc.deck.create.useMutation({
    onSuccess: () => {
      utils.deck.list.invalidate()
      setNewName('')
    },
  })
  const rename = trpc.deck.rename.useMutation({
    onSuccess: () => utils.deck.list.invalidate(),
  })
  const del = trpc.deck.delete.useMutation({
    onSuccess: () => utils.deck.list.invalidate(),
  })

  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [cardModalOpen, setCardModalOpen] = useState(false)

  function startEdit(id: string, currentName: string) {
    setEditingId(id)
    setEditingName(currentName)
  }

  function commitEdit(id: string) {
    if (editingName.trim() && editingName.trim() !== decks?.find(d => d.id === id)?.name) {
      rename.mutate({ id, name: editingName.trim() })
    }
    setEditingId(null)
  }

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="hidden lg:flex w-56 shrink-0 border-r p-4 flex-col gap-4">
        <nav className="flex flex-col gap-1">
          <Link href="/" className="text-sm font-medium px-2 py-1.5 rounded hover:bg-accent">Notes</Link>
          <Link href="/tasks" className="text-sm font-medium px-2 py-1.5 rounded hover:bg-accent">Tasks</Link>
          <Link href="/graph" className="text-sm font-medium px-2 py-1.5 rounded hover:bg-accent">Graph</Link>
          <Link href="/decks" className="text-sm font-medium px-2 py-1.5 rounded hover:bg-accent bg-accent">Decks</Link>
          <Link href="/review" className="text-sm font-medium px-2 py-1.5 rounded hover:bg-accent">Review</Link>
          <Link href="/settings" className="text-sm font-medium px-2 py-1.5 rounded hover:bg-accent">Settings</Link>
        </nav>
      </aside>

      {/* Main content */}
      <main className="flex-1 p-6 max-w-3xl">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Decks</h1>
          <Button onClick={() => setCardModalOpen(true)} size="sm">New Card</Button>
        </div>

        {/* Create new deck */}
        <div className="flex gap-2 mb-6">
          <Input
            placeholder="New deck name..."
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && newName.trim()) {
                create.mutate({ name: newName.trim() })
              }
            }}
            className="flex-1"
          />
          <Button
            onClick={() => newName.trim() && create.mutate({ name: newName.trim() })}
            disabled={create.isPending || !newName.trim()}
          >
            Create
          </Button>
        </div>

        {/* Deck list */}
        <div className="space-y-2">
          {decks?.length === 0 && (
            <p className="text-muted-foreground text-sm">No decks yet. Create one above.</p>
          )}
          {decks?.map(deck => (
            <div
              key={deck.id}
              className="flex items-center gap-3 p-3 rounded-lg border hover:bg-accent/50"
            >
              {editingId === deck.id ? (
                <Input
                  autoFocus
                  value={editingName}
                  onChange={e => setEditingName(e.target.value)}
                  onBlur={() => commitEdit(deck.id)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') commitEdit(deck.id)
                    if (e.key === 'Escape') setEditingId(null)
                  }}
                  className="flex-1 h-7"
                />
              ) : (
                <span
                  className="flex-1 font-medium cursor-pointer hover:underline"
                  onClick={() => startEdit(deck.id, deck.name)}
                  title="Click to rename"
                >
                  {deck.name}
                </span>
              )}
              <Badge variant="secondary">{deck.cardCount} cards</Badge>
              <AlertDialog>
                <AlertDialogTrigger
                  render={
                    <Button variant="ghost" size="icon-sm" className="text-destructive hover:text-destructive" />
                  }
                >
                  ×
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete deck?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will delete &ldquo;{deck.name}&rdquo;. Cards in this deck will not be deleted.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      variant="destructive"
                      onClick={() => del.mutate(deck.id)}
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ))}
        </div>
      </main>

      <CardCreationModal
        open={cardModalOpen}
        onClose={() => setCardModalOpen(false)}
      />
    </div>
  )
}
