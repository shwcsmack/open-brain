'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { trpc } from '@/lib/trpc'
import { previewNextStates, Rating } from '@/lib/fsrs'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

// Type for flashcard as returned by the router
type Flashcard = {
  id: string
  type: 'BASIC' | 'CLOZE'
  front: string
  back: string | null
  clozeIndex: number | null
  noteId: string | null
  stability: number
  difficulty: number
  due: Date
  reps: number
  lapses: number
  state: string
  lastReview: Date | null
  deletedAt: Date | null
  createdAt: Date
}

function renderFront(card: { type: string; front: string }) {
  if (card.type === 'CLOZE') {
    const parts = card.front.split('[...]')
    return (
      <span>
        {parts.map((part, i) => (
          <span key={i}>
            {part}
            {i < parts.length - 1 && (
              <span className="inline-block min-w-[60px] border-b-2 border-primary mx-1 font-bold text-primary">[...]</span>
            )}
          </span>
        ))}
      </span>
    )
  }
  return <span>{card.front}</span>
}

function formatInterval(days: number): string {
  if (days === 0) return '<1d'
  if (days < 30) return `${days}d`
  if (days < 365) return `${Math.round(days / 30)}mo`
  return `${Math.round(days / 365)}y`
}

export default function ReviewSessionPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const deckId = searchParams.get('deckId') ?? undefined

  const { data: dueCards } = trpc.review.listDue.useQuery({ deckId })
  const rateMutation = trpc.review.rate.useMutation()

  const [queue, setQueue] = useState<Flashcard[]>([])
  const [current, setCurrent] = useState<Flashcard | null>(null)
  const [flipped, setFlipped] = useState(false)
  const [reviewedCount, setReviewedCount] = useState(0)
  const [againCount, setAgainCount] = useState(0)
  const requeueCountsRef = useRef<Map<string, number>>(new Map())
  const [done, setDone] = useState(false)
  const [initialized, setInitialized] = useState(false)
  const [siblings, setSiblings] = useState<Flashcard[]>([])

  const { data: dueCounts } = trpc.review.dueCounts.useQuery(undefined, { enabled: done })

  // Initialize queue when data arrives
  useEffect(() => {
    if (dueCards && !initialized) {
      setInitialized(true)
      const cards = dueCards as Flashcard[]
      setQueue(cards.slice(1))
      setCurrent(cards[0] ?? null)
      if (cards.length === 0) setDone(true)
    }
  }, [dueCards, initialized])

  const handleRate = useCallback(
    async (ratingStr: 'Again' | 'Hard' | 'Good' | 'Easy') => {
      if (!current || !flipped) return
      if (rateMutation.isPending) return

      const result = await rateMutation.mutateAsync({ cardId: current.id, rating: ratingStr })

      setReviewedCount(c => c + 1)

      // "Again" re-queue logic — append to end, cap at 3 per card
      let willRequeue = false
      if (ratingStr === 'Again') {
        setAgainCount(c => c + 1)
        const count = requeueCountsRef.current.get(current.id) ?? 0
        if (count < 3) {
          requeueCountsRef.current = new Map(requeueCountsRef.current).set(current.id, count + 1)
          willRequeue = true
        }
      }

      setSiblings(result.siblings as Flashcard[])

      // Advance queue using functional updater to avoid stale closure
      setQueue(prevQueue => {
        const tail = prevQueue.slice(1)
        const nextQueue = willRequeue ? [...tail, current] : tail
        if (nextQueue.length === 0) {
          setDone(true)
          setSiblings([])
        } else {
          setCurrent(nextQueue[0])
          setFlipped(false)
          setSiblings([])
        }
        return nextQueue
      })
    },
    [current, flipped, rateMutation]
  )

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!flipped) {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault()
          setFlipped(true)
        }
      } else {
        if (rateMutation.isPending) return
        if (e.key === '1') handleRate('Again')
        if (e.key === '2') handleRate('Hard')
        if (e.key === '3') handleRate('Good')
        if (e.key === '4') handleRate('Easy')
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [flipped, handleRate, rateMutation.isPending])

  // Pre-compute FSRS interval previews for current card
  const previews = current
    ? previewNextStates({
        stability: current.stability,
        difficulty: current.difficulty,
        due: new Date(current.due),
        reps: current.reps,
        lapses: current.lapses,
        state: current.state,
        lastReview: current.lastReview ? new Date(current.lastReview) : null,
      })
    : null

  // Session complete screen
  if (done) {
    return (
      <div className="flex min-h-screen">
        <aside className="hidden lg:flex w-56 shrink-0 border-r p-4 flex-col gap-4">
          <nav className="flex flex-col gap-1">
            <Link href="/" className="text-sm font-medium px-2 py-1.5 rounded hover:bg-accent">Notes</Link>
            <Link href="/tasks" className="text-sm font-medium px-2 py-1.5 rounded hover:bg-accent">Tasks</Link>
            <Link href="/graph" className="text-sm font-medium px-2 py-1.5 rounded hover:bg-accent">Graph</Link>
            <Link href="/decks" className="text-sm font-medium px-2 py-1.5 rounded hover:bg-accent">Decks</Link>
            <Link href="/review" className="text-sm font-medium px-2 py-1.5 rounded hover:bg-accent bg-accent">Review</Link>
            <Link href="/settings" className="text-sm font-medium px-2 py-1.5 rounded hover:bg-accent">Settings</Link>
          </nav>
        </aside>
        <main className="flex-1 p-6 flex items-center justify-center">
          <div className="text-center space-y-6 max-w-sm">
            <div className="text-5xl">🎉</div>
            <h1 className="text-2xl font-bold">Session complete!</h1>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>Cards reviewed: <span className="text-foreground font-medium">{reviewedCount}</span></p>
              <p>Again count: <span className="text-foreground font-medium">{againCount}</span></p>
              <div className="text-sm text-muted-foreground">
                Next session: <span className="font-semibold">{dueCounts?.totalDue ?? 0} cards due</span>
              </div>
            </div>
            <div className="flex gap-3 justify-center">
              <Button onClick={() => router.push('/review')} variant="outline">
                Back to review
              </Button>
              <Button onClick={() => {
                setInitialized(false)
                setDone(false)
                setQueue([])
                setCurrent(null)
                setFlipped(false)
                setReviewedCount(0)
                setAgainCount(0)
                requeueCountsRef.current = new Map()
                setSiblings([])
              }}>
                Study again
              </Button>
            </div>
          </div>
        </main>
      </div>
    )
  }

  // Loading state
  if (!initialized) {
    return (
      <div className="flex min-h-screen">
        <aside className="hidden lg:flex w-56 shrink-0 border-r p-4 flex-col gap-4">
          <nav className="flex flex-col gap-1">
            <Link href="/" className="text-sm font-medium px-2 py-1.5 rounded hover:bg-accent">Notes</Link>
            <Link href="/tasks" className="text-sm font-medium px-2 py-1.5 rounded hover:bg-accent">Tasks</Link>
            <Link href="/graph" className="text-sm font-medium px-2 py-1.5 rounded hover:bg-accent">Graph</Link>
            <Link href="/decks" className="text-sm font-medium px-2 py-1.5 rounded hover:bg-accent">Decks</Link>
            <Link href="/review" className="text-sm font-medium px-2 py-1.5 rounded hover:bg-accent bg-accent">Review</Link>
            <Link href="/settings" className="text-sm font-medium px-2 py-1.5 rounded hover:bg-accent">Settings</Link>
          </nav>
        </aside>
        <main className="flex-1 p-6 flex items-center justify-center">
          <p className="text-muted-foreground">Loading cards...</p>
        </main>
      </div>
    )
  }

  // No cards state (should only hit if initialized but current is null)
  if (!current) {
    return (
      <div className="flex min-h-screen">
        <aside className="hidden lg:flex w-56 shrink-0 border-r p-4 flex-col gap-4">
          <nav className="flex flex-col gap-1">
            <Link href="/" className="text-sm font-medium px-2 py-1.5 rounded hover:bg-accent">Notes</Link>
            <Link href="/review" className="text-sm font-medium px-2 py-1.5 rounded hover:bg-accent bg-accent">Review</Link>
          </nav>
        </aside>
        <main className="flex-1 p-6 flex items-center justify-center">
          <div className="text-center space-y-4">
            <p className="text-muted-foreground">No cards due.</p>
            <Button onClick={() => router.push('/review')} variant="outline">Back to review</Button>
          </div>
        </main>
      </div>
    )
  }

  const isCloze = current.type === 'CLOZE'
  const remaining = queue.length + 1 // current + rest

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="hidden lg:flex w-56 shrink-0 border-r p-4 flex-col gap-4">
        <nav className="flex flex-col gap-1">
          <Link href="/" className="text-sm font-medium px-2 py-1.5 rounded hover:bg-accent">Notes</Link>
          <Link href="/tasks" className="text-sm font-medium px-2 py-1.5 rounded hover:bg-accent">Tasks</Link>
          <Link href="/graph" className="text-sm font-medium px-2 py-1.5 rounded hover:bg-accent">Graph</Link>
          <Link href="/decks" className="text-sm font-medium px-2 py-1.5 rounded hover:bg-accent">Decks</Link>
          <Link href="/review" className="text-sm font-medium px-2 py-1.5 rounded hover:bg-accent bg-accent">Review</Link>
          <Link href="/settings" className="text-sm font-medium px-2 py-1.5 rounded hover:bg-accent">Settings</Link>
        </nav>
        <div className="border-t pt-4 space-y-1 text-xs text-muted-foreground">
          <p>Reviewed: {reviewedCount}</p>
          <p>Remaining: {remaining}</p>
          {againCount > 0 && <p>Again: {againCount}</p>}
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 p-6 flex flex-col items-center">
        {/* Progress */}
        <div className="w-full max-w-2xl mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {isCloze ? 'Cloze' : 'Basic'}
            </Badge>
            {current.noteId && (
              <Badge variant="secondary" className="text-xs">from note</Badge>
            )}
          </div>
          <span className="text-sm text-muted-foreground">{remaining} remaining</span>
        </div>

        {/* Card */}
        <div className="w-full max-w-2xl">
          {/* Front */}
          <div className="rounded-xl border bg-card p-8 mb-4 min-h-40 flex items-center justify-center">
            <p className="text-lg text-center leading-relaxed">{renderFront(current)}</p>
          </div>

          {/* Answer (when flipped) */}
          {flipped && (
            <div className="rounded-xl border bg-muted/30 p-8 mb-6 min-h-24 flex flex-col items-center justify-center gap-4">
              {isCloze ? (
                <>
                  <p className="text-lg text-center font-medium leading-relaxed">
                    Answer:{' '}
                    <mark className="bg-yellow-100 dark:bg-yellow-900 rounded px-1">
                      {current.back ?? '(no answer)'}
                    </mark>
                  </p>
                  {/* Sibling cloze cards */}
                  {siblings.length > 0 && (
                    <div className="w-full border-t pt-4 mt-2">
                      <p className="text-xs text-muted-foreground mb-2">Other blanks in same note:</p>
                      <div className="space-y-1">
                        {siblings.map(s => (
                          <p key={s.id} className="text-sm text-muted-foreground">
                            {s.front}{s.back ? ` → ${s.back}` : ''}
                          </p>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-lg text-center leading-relaxed">{current.back}</p>
              )}
            </div>
          )}

          {/* Flip button or rating buttons */}
          {!flipped ? (
            <div className="flex justify-center">
              <Button onClick={() => setFlipped(true)} className="px-8">
                Show answer
                <span className="ml-2 text-xs opacity-60">(Space / Enter)</span>
              </Button>
            </div>
          ) : (
            <div className="flex gap-2 justify-center flex-wrap">
              {(
                [
                  { label: 'Again', key: '1', rating: Rating.Again },
                  { label: 'Hard', key: '2', rating: Rating.Hard },
                  { label: 'Good', key: '3', rating: Rating.Good },
                  { label: 'Easy', key: '4', rating: Rating.Easy },
                ] as const
              ).map(({ label, key, rating }) => {
                const interval = previews ? previews[rating].scheduledDays : null
                return (
                  <Button
                    key={label}
                    variant={label === 'Again' ? 'destructive' : label === 'Easy' ? 'secondary' : 'outline'}
                    onClick={() => handleRate(label)}
                    disabled={rateMutation.isPending}
                    className="flex flex-col h-auto py-2 px-4 gap-0.5"
                  >
                    <span className="text-xs opacity-60">{key}</span>
                    <span>{label}</span>
                    {interval !== null && (
                      <span className="text-xs opacity-70">{formatInterval(interval)}</span>
                    )}
                  </Button>
                )
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
