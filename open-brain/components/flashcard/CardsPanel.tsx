'use client'
import { useState } from 'react'
import { trpc } from '@/lib/trpc'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CardCreationModal } from './CardCreationModal'

interface CardsPanelProps {
  noteId: string
}

export function CardsPanel({ noteId }: CardsPanelProps) {
  const utils = trpc.useUtils()
  const { data: cards, isLoading } = trpc.flashcard.listByNote.useQuery(noteId)
  const softDelete = trpc.flashcard.softDelete.useMutation({
    onSuccess: () => utils.flashcard.listByNote.invalidate(noteId),
  })

  const [modalOpen, setModalOpen] = useState(false)

  if (isLoading) {
    return <div className="text-sm text-muted-foreground p-4">Loading cards...</div>
  }

  return (
    <div className="space-y-2 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Flashcards
        </h3>
        <Button size="xs" variant="outline" onClick={() => setModalOpen(true)}>
          Add card
        </Button>
      </div>

      {!cards?.length ? (
        <div className="text-sm text-muted-foreground">No cards yet.</div>
      ) : (
        <ul className="space-y-1">
          {cards.map((card) => (
            <li
              key={card.id}
              className="flex items-center justify-between gap-2 rounded p-2 hover:bg-accent"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Badge variant={card.type === 'CLOZE' ? 'secondary' : 'outline'}>
                  {card.type}
                </Badge>
                <span className="text-sm truncate" title={card.front}>
                  {card.front.length > 60 ? `${card.front.slice(0, 60)}…` : card.front}
                </span>
              </div>
              <Button
                size="icon-xs"
                variant="ghost"
                onClick={() => softDelete.mutate(card.id)}
                title="Delete card"
              >
                ×
              </Button>
            </li>
          ))}
        </ul>
      )}

      <CardCreationModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        noteId={noteId}
      />
    </div>
  )
}
