'use client'
import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { trpc } from '@/lib/trpc'
import { Input } from '@/components/ui/input'
import { useDebounce } from '@/lib/hooks/useDebounce'
import { formatDistanceToNow } from 'date-fns'

export function SearchModal() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedIdx, setSelectedIdx] = useState(0)
  const debouncedQuery = useDebounce(query, 200)
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)

  const { data: results } = trpc.search.query.useQuery(
    { q: debouncedQuery },
    { enabled: open }
  )

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(o => !o)
        setQuery('')
        setSelectedIdx(0)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50)
  }, [open])

  const navigateResult = (e: React.KeyboardEvent) => {
    if (!results) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIdx(i => Math.min(i + 1, results.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIdx(i => Math.max(i - 1, 0)) }
    if (e.key === 'Enter' && results[selectedIdx]) selectResult(results[selectedIdx])
  }

  const selectResult = (result: any) => {
    setOpen(false)
    setQuery('')
    if (result.type === 'note') router.push(`/notes/${result.slug}`)
    else if (result.type === 'task') router.push('/tasks')
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/50" onClick={() => setOpen(false)}>
      <div className="w-full max-w-lg bg-background rounded-xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center border-b px-4">
          <span className="text-muted-foreground mr-2 text-sm">Search</span>
          <Input
            ref={inputRef}
            placeholder="Search notes and tasks..."
            value={query}
            onChange={e => { setQuery(e.target.value); setSelectedIdx(0) }}
            onKeyDown={navigateResult}
            className="border-0 shadow-none px-0 py-3 text-base focus-visible:ring-0"
          />
        </div>
        <div className="max-h-80 overflow-y-auto py-1">
          {!query.trim() && (!results || results.length === 0) && (
            <p className="p-4 text-sm text-muted-foreground">Start typing to search...</p>
          )}
          {query.trim() && results?.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">No results for &quot;{query}&quot;</p>
          )}
          {results?.map((r, i) => (
            <button
              key={r.id}
              className={`w-full text-left px-4 py-2 hover:bg-accent ${i === selectedIdx ? 'bg-accent' : ''}`}
              onClick={() => selectResult(r)}
              onMouseEnter={() => setSelectedIdx(i)}
            >
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground uppercase shrink-0">{r.type}</span>
                <span className="font-medium text-sm truncate">{r.title}</span>
                {r.updatedAt && (
                  <span className="text-xs text-muted-foreground ml-auto shrink-0">
                    {formatDistanceToNow(new Date(r.updatedAt), { addSuffix: true })}
                  </span>
                )}
              </div>
              {r.snippet && (
                <p
                  className="text-xs text-muted-foreground mt-0.5 truncate"
                  dangerouslySetInnerHTML={{ __html: r.snippet }}
                />
              )}
            </button>
          ))}
        </div>
        <div className="border-t px-4 py-2 text-xs text-muted-foreground flex gap-4">
          <span>&#8593;&#8595; Navigate</span>
          <span>&#8629; Open</span>
          <span>Esc Close</span>
        </div>
      </div>
    </div>
  )
}
