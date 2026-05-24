'use client'
import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { trpc } from '@/lib/trpc'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface CardCreationModalProps {
  open: boolean
  onClose: () => void
  noteId?: string
  initialFront?: string
  sourceReadingItemId?: string
}

export function CardCreationModal({
  open,
  onClose,
  noteId,
  initialFront = '',
  sourceReadingItemId,
}: CardCreationModalProps) {
  const utils = trpc.useUtils()
  const [type, setType] = useState<'BASIC' | 'CLOZE'>('BASIC')
  const [front, setFront] = useState(initialFront)
  const [back, setBack] = useState('')
  const [deckId, setDeckId] = useState<string>('')

  const { data: decks } = trpc.deck.list.useQuery()
  const createCard = trpc.flashcard.create.useMutation({
    onSuccess: () => {
      if (noteId) {
        utils.flashcard.listByNote.invalidate(noteId)
      }
      onClose()
    },
    onError: () => toast.error('Failed to create flashcard'),
  })

  // Sync front when initialFront prop changes (e.g. new selection)
  useEffect(() => {
    setFront(initialFront)
  }, [initialFront])

  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      setFront(initialFront)
      setBack('')
      setType('BASIC')
      setDeckId('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!front.trim()) return
    createCard.mutate({
      type,
      front: front.trim(),
      back: type === 'BASIC' ? back.trim() || undefined : undefined,
      noteId: noteId || undefined,
      deckId: deckId || undefined,
      sourceReadingItemId: sourceReadingItemId || undefined,
    })
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Flashcard</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 mt-2">
          {/* Type toggle */}
          <div className="flex gap-2">
            <Button
              type="button"
              variant={type === 'BASIC' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setType('BASIC')}
            >
              Basic
            </Button>
            <Button
              type="button"
              variant={type === 'CLOZE' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setType('CLOZE')}
            >
              Cloze
            </Button>
          </div>

          {/* Front */}
          <div className="flex flex-col gap-1">
            <label htmlFor="card-front" className="text-sm font-medium">Front</label>
            <Input
              id="card-front"
              value={front}
              onChange={(e) => setFront(e.target.value)}
              placeholder="Question / prompt"
              required
            />
          </div>

          {/* Back (hidden for Cloze) */}
          {type === 'BASIC' && (
            <div className="flex flex-col gap-1">
              <label htmlFor="card-back" className="text-sm font-medium">Back</label>
              <Input
                id="card-back"
                value={back}
                onChange={(e) => setBack(e.target.value)}
                placeholder="Answer"
              />
            </div>
          )}

          {/* Deck selector */}
          <div className="flex flex-col gap-1">
            <label htmlFor="card-deck" className="text-sm font-medium">Deck (optional)</label>
            <select
              id="card-deck"
              value={deckId}
              onChange={(e) => setDeckId(e.target.value)}
              className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <option value="">No deck</option>
              {decks?.map((deck) => (
                <option key={deck.id} value={deck.id}>
                  {deck.name}
                </option>
              ))}
            </select>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={createCard.isPending}>
              {createCard.isPending ? 'Adding...' : 'Add Card'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
