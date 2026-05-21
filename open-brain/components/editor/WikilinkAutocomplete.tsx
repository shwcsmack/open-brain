'use client'

import { createPortal } from 'react-dom'

export interface WikilinkAutocompleteNote {
  id: string
  title: string
  slug: string
  tags: string
}

interface Props {
  items: WikilinkAutocompleteNote[]
  selectedIndex: number
  rect: DOMRect
  onSelect: (note: WikilinkAutocompleteNote) => void
}

function parseTags(tags: string): string[] {
  try {
    const parsed = JSON.parse(tags)
    return Array.isArray(parsed) ? parsed.filter((tag): tag is string => typeof tag === 'string') : []
  } catch {
    return []
  }
}

export function WikilinkAutocomplete({ items, selectedIndex, rect, onSelect }: Props) {
  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      className="fixed z-50 w-72 rounded-md border bg-popover text-popover-foreground shadow-md"
      style={{
        left: rect.left,
        top: rect.bottom + 6,
      }}
      role="listbox"
      aria-label="Wikilink suggestions"
    >
      {items.length === 0 ? (
        <div className="px-3 py-2 text-sm text-muted-foreground">No matching notes</div>
      ) : (
        <div className="max-h-72 overflow-y-auto p-1">
          {items.map((item, index) => {
            const tags = parseTags(item.tags)
            const selected = index === selectedIndex

            return (
              <button
                key={item.id}
                type="button"
                className={`block w-full rounded-sm px-2 py-2 text-left text-sm ${
                  selected ? 'bg-accent text-accent-foreground' : 'hover:bg-accent hover:text-accent-foreground'
                }`}
                onMouseDown={(event) => {
                  event.preventDefault()
                  onSelect(item)
                }}
                role="option"
                aria-selected={selected}
              >
                <div className="font-medium leading-none">{item.title}</div>
                {tags.length > 0 ? (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : null}
              </button>
            )
          })}
        </div>
      )}
    </div>,
    document.body
  )
}
