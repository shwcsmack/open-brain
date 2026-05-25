import Link from 'next/link'

const FOCUS_RING =
  'outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'

export default function ReadingItemNotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-bold">Reading item not found</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        This item does not exist or was deleted. Check the link or return to your reading queue.
      </p>
      <Link
        href="/reading"
        className={`text-sm font-medium text-primary hover:underline rounded-sm ${FOCUS_RING}`}
      >
        ← Back to Reading Queue
      </Link>
    </div>
  )
}
