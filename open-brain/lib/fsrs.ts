import { fsrs, generatorParameters, Rating, State, type FSRSParameters, type Card, type Grade } from 'ts-fsrs'

export type { Grade }
import type { FSRSState } from '@/lib/generated/prisma/enums'

export { Rating, State }

const params: FSRSParameters = generatorParameters()
const f = fsrs(params)

// Prisma FSRSState enum strings mapped to ts-fsrs numeric State
const prismaStateToFsrs: Record<string, State> = {
  NEW: State.New,
  LEARNING: State.Learning,
  REVIEW: State.Review,
  RELEARNING: State.Relearning,
}

const fsrsStateToPrisma: Record<number, FSRSState> = {
  [State.New]: 'NEW',
  [State.Learning]: 'LEARNING',
  [State.Review]: 'REVIEW',
  [State.Relearning]: 'RELEARNING',
}

export interface FSRSCard {
  stability: number
  difficulty: number
  due: Date
  reps: number
  lapses: number
  // Accepts either numeric State or Prisma string enum
  state: number | string
  lastReview: Date | null
}

export function computeNextState(
  card: FSRSCard,
  rating: Grade
): {
  stability: number
  difficulty: number
  due: Date
  reps: number
  lapses: number
  state: FSRSState
  lastReview: Date
  scheduledDays: number
} {
  // Resolve state: handle both numeric (ts-fsrs) and string (Prisma) representations
  const numericState: State =
    typeof card.state === 'string'
      ? (prismaStateToFsrs[card.state] ?? State.New)
      : (card.state as State)

  const fsrsCard: Card = {
    due: card.due,
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.lastReview
      ? Math.floor((Date.now() - card.lastReview.getTime()) / 86400000)
      : 0,
    scheduled_days: 0,
    learning_steps: 0,
    reps: card.reps,
    lapses: card.lapses,
    state: numericState,
    last_review: card.lastReview ?? undefined,
  }

  const result = f.next(fsrsCard, new Date(), rating)

  return {
    stability: result.card.stability,
    difficulty: result.card.difficulty,
    due: result.card.due,
    reps: result.card.reps,
    lapses: result.card.lapses,
    state: fsrsStateToPrisma[result.card.state] ?? 'NEW',
    lastReview: result.card.last_review ?? new Date(),
    scheduledDays: result.card.scheduled_days,
  }
}

// Preview all 4 ratings for a card (used to show "Good — 8d" on buttons)
export function previewNextStates(
  card: FSRSCard
): Record<Grade, ReturnType<typeof computeNextState>> {
  return {
    [Rating.Again]: computeNextState(card, Rating.Again),
    [Rating.Hard]: computeNextState(card, Rating.Hard),
    [Rating.Good]: computeNextState(card, Rating.Good),
    [Rating.Easy]: computeNextState(card, Rating.Easy),
  }
}
