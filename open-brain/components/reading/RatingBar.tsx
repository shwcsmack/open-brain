'use client'
import { Button } from '@/components/ui/button'

type Rating = 'Again' | 'Hard' | 'Good' | 'Easy'

interface Props {
  onRate: (rating: Rating) => void
  isPending: boolean
}

const RATINGS: { label: Rating; className: string }[] = [
  { label: 'Again', className: 'text-destructive' },
  { label: 'Hard', className: 'text-orange-600 dark:text-orange-400' },
  { label: 'Good', className: 'text-green-600 dark:text-green-400' },
  { label: 'Easy', className: 'text-blue-600 dark:text-blue-400' },
]

export function RatingBar({ onRate, isPending }: Props) {
  return (
    <div className="flex flex-wrap justify-center gap-2">
      {RATINGS.map(r => (
        <Button
          key={r.label}
          variant="outline"
          size="sm"
          className={r.className}
          onClick={() => onRate(r.label)}
          disabled={isPending}
        >
          {r.label}
        </Button>
      ))}
    </div>
  )
}
