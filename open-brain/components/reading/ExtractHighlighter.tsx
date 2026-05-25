'use client'
import { useMemo, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { preprocessWikilinks } from '@/components/editor/NoteViewer'
import {
  canonicalWikipediaArticleUrl,
  extractWikipediaTitleFromUrl,
  wikipediaSlugFromTitleOrUrl,
} from '@/lib/wikipedia'

const FOCUS_RING =
  'outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'

export interface WikipediaImportState {
  id: string
  archivedAt: Date | string | null
}

interface Props {
  markdown: string
  extractedTexts: string[]
  hiddenPassages?: string[]
  importedWikipediaUrls?: Record<string, WikipediaImportState>
  onAddWikipediaLink?: (url: string) => void
  onRestorePassage?: (text: string) => void
  onRestorePassages?: (texts: string[]) => void
}

function isWikipediaUrl(href: string): boolean {
  try {
    return new URL(href).hostname.endsWith('wikipedia.org')
  } catch {
    return false
  }
}

function isEnglishWikipediaHost(hostname: string): boolean {
  return hostname === 'en.wikipedia.org' || hostname === 'en.m.wikipedia.org'
}

function normalizeWikiSlug(slug: string): string {
  return slug.trim().replace(/ /g, '_')
}

/** Lookup keys for imported map: fragment/query stripped; en wiki canonicalized; other hosts stay on same host. */
export function wikipediaLookupKeys(href: string): string[] {
  const keys: string[] = []
  const add = (key: string) => {
    if (key && !keys.includes(key)) keys.push(key)
  }

  add(href)

  if (!href.startsWith('http')) {
    const slug = wikipediaSlugFromTitleOrUrl(href)
    if (slug) {
      for (const variant of slugLookupVariants(slug)) {
        add(canonicalWikipediaArticleUrl(variant))
      }
    }
    return keys
  }

  try {
    const parsed = new URL(href)
    if (!parsed.hostname.endsWith('wikipedia.org')) return keys

    parsed.hash = ''
    parsed.search = ''
    add(parsed.toString())

    const rawSlug = extractWikipediaTitleFromUrl(href)
    if (!rawSlug) return keys

    const english = isEnglishWikipediaHost(parsed.hostname)

    for (const variant of slugLookupVariants(rawSlug)) {
      if (english) {
        add(canonicalWikipediaArticleUrl(variant))
      } else {
        add(`${parsed.protocol}//${parsed.hostname}/wiki/${encodeURIComponent(variant)}`)
      }
    }
  } catch {
    const slug = wikipediaSlugFromTitleOrUrl(href)
    if (slug) {
      for (const variant of slugLookupVariants(slug)) {
        add(canonicalWikipediaArticleUrl(variant))
      }
    }
  }

  return keys
}

function slugLookupVariants(slug: string): string[] {
  const normalized = normalizeWikiSlug(slug)
  const variants = new Set<string>([normalized])
  const underscored = normalized.replace(/ /g, '_')
  const spaced = normalized.replace(/_/g, ' ')
  variants.add(underscored)
  variants.add(spaced)
  variants.add(normalizeWikiSlug(underscored))
  variants.add(normalizeWikiSlug(spaced))
  return [...variants].filter(Boolean)
}

export function lookupWikipediaImport(
  href: string,
  imported?: Record<string, WikipediaImportState>
): WikipediaImportState | undefined {
  if (!imported) return undefined
  for (const key of wikipediaLookupKeys(href)) {
    const match = imported[key]
    if (match) return match
  }
  return undefined
}

function wikipediaActionSuffix(state: 'unimported' | 'active' | 'archived'): string {
  if (state === 'unimported') return ', add to reading queue'
  if (state === 'archived') return ', open archived Wikipedia article'
  return ', open Wikipedia article'
}

function markExtracts(markdown: string, extracts: string[]): string {
  let result = markdown
  for (const text of extracts) {
    const normalized = text.replace(/\s+/g, ' ').trim()
    if (!normalized) continue
    const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(`(${escaped})`, 'gi')
    result = result.replace(re, '~~$1~~')
  }
  return result
}

function markHiddenPassages(
  markdown: string,
  passages: string[]
): { md: string; restoreMap: Record<string, string[]> } {
  if (passages.length === 0) return { md: markdown, restoreMap: {} }

  interface Range {
    start: number
    end: number
    text: string
  }

  const ranges: Range[] = []
  for (const text of passages) {
    const normalized = text.replace(/\s+/g, ' ').trim()
    if (!normalized) continue
    const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(escaped, 'gi')
    let match: RegExpExecArray | null
    while ((match = re.exec(markdown)) !== null) {
      ranges.push({ start: match.index, end: match.index + match[0].length, text })
    }
  }

  if (ranges.length === 0) return { md: markdown, restoreMap: {} }

  ranges.sort((a, b) => a.start - b.start)

  const merged: { start: number; end: number; texts: string[]; key: string }[] = []
  let groupCounter = 0

  for (const range of ranges) {
    const last = merged[merged.length - 1]
    if (last) {
      if (range.start < last.end) {
        last.end = Math.max(last.end, range.end)
        if (!last.texts.includes(range.text)) last.texts.push(range.text)
        continue
      }
      const gap = markdown.slice(last.end, range.start)
      if (/^\s*$/.test(gap)) {
        last.end = range.end
        if (!last.texts.includes(range.text)) last.texts.push(range.text)
        continue
      }
    }
    merged.push({
      start: range.start,
      end: range.end,
      texts: [range.text],
      key: `restore-group-${groupCounter++}`,
    })
  }

  const restoreMap: Record<string, string[]> = {}
  for (const m of merged) {
    restoreMap[m.key] = m.texts
  }

  let result = markdown
  for (const m of [...merged].sort((a, b) => b.start - a.start)) {
    const count = m.texts.length
    const label = count === 1 ? '1 passage hidden' : `${count} passages hidden`
    result = result.slice(0, m.start) + `[${label}](#${m.key})` + result.slice(m.end)
  }

  return { md: result, restoreMap }
}

function WikipediaLinkWithPill({
  state,
  onAction,
  children,
}: {
  state: 'unimported' | 'active' | 'archived'
  onAction: () => void
  children: ReactNode
}) {
  const pillClassName =
    state === 'unimported'
      ? 'rounded-full bg-green-500/15 px-1.5 text-xs font-medium text-green-800 dark:text-green-300'
      : state === 'archived'
        ? 'rounded-full bg-amber-500/15 px-1.5 text-xs font-medium text-amber-800 dark:text-amber-300'
        : 'rounded-full bg-blue-500/15 px-1.5 text-xs font-medium text-blue-800 dark:text-blue-300'

  const pillLabel = state === 'unimported' ? '+' : '✓'

  return (
    <button
      type="button"
      onClick={onAction}
      className={`not-prose inline-flex min-h-6 min-w-6 cursor-pointer items-center gap-1 rounded-sm border border-transparent bg-transparent p-0 text-primary underline ${FOCUS_RING}`}
    >
      <span className="underline">{children}</span>
      <span className="sr-only">{wikipediaActionSuffix(state)}</span>
      <span className={pillClassName} aria-hidden="true">
        {pillLabel}
      </span>
    </button>
  )
}

function PassageTombstone({
  count,
  onRestore,
}: {
  count: number
  onRestore: () => void
}) {
  const label = count === 1 ? '1 passage hidden' : `${count} passages hidden`
  const restoreAriaLabel =
    count === 1 ? 'Restore 1 hidden passage' : `Restore ${count} hidden passages`

  return (
    <span
      role="group"
      aria-label={label}
      className={`not-prose my-1 inline-flex items-center gap-2 rounded border border-dashed border-muted-foreground/40 bg-muted/30 px-2 py-0.5 text-xs text-muted-foreground`}
    >
      {label}
      <button
        type="button"
        onClick={onRestore}
        aria-label={restoreAriaLabel}
        className={`inline-flex min-h-6 items-center rounded-sm border border-transparent bg-transparent px-0.5 underline hover:text-foreground ${FOCUS_RING}`}
      >
        Restore
      </button>
    </span>
  )
}

export function ExtractHighlighter({
  markdown,
  extractedTexts,
  hiddenPassages = [],
  importedWikipediaUrls,
  onAddWikipediaLink,
  onRestorePassage,
  onRestorePassages,
}: Props) {
  const { processedMarkdown, restoreMap } = useMemo(() => {
    let md = markdown
    let restoreMap: Record<string, string[]> = {}
    if (hiddenPassages.length > 0) {
      const hidden = markHiddenPassages(md, hiddenPassages)
      md = hidden.md
      restoreMap = hidden.restoreMap
    }
    if (extractedTexts.length > 0) {
      md = markExtracts(md, extractedTexts)
    }
    return { processedMarkdown: md, restoreMap }
  }, [markdown, extractedTexts, hiddenPassages])

  return (
    <div className="prose prose-sm max-w-none dark:prose-invert">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => {
            if (href?.startsWith('#restore-')) {
              const key = href.slice(1)
              const texts = restoreMap[key]
              if (texts?.length && (onRestorePassages || onRestorePassage)) {
                return (
                  <PassageTombstone
                    count={texts.length}
                    onRestore={() => {
                      if (onRestorePassages) onRestorePassages(texts)
                      else if (onRestorePassage) {
                        for (const text of texts) onRestorePassage(text)
                      }
                    }}
                  />
                )
              }
              return <span>{children}</span>
            }

            const wiki = href && isWikipediaUrl(href)
            if (wiki && onAddWikipediaLink && href) {
              const importState = lookupWikipediaImport(href, importedWikipediaUrls)
              const pillState = importState
                ? importState.archivedAt != null
                  ? 'archived'
                  : 'active'
                : 'unimported'

              return (
                <WikipediaLinkWithPill
                  state={pillState}
                  onAction={() => onAddWikipediaLink(href)}
                >
                  {children}
                </WikipediaLinkWithPill>
              )
            }

            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline"
              >
                {children}
              </a>
            )
          },
          del: ({ children }) => (
            <span className="bg-yellow-100/60 text-yellow-900/60 line-through dark:bg-yellow-900/20">
              {children}
            </span>
          ),
        }}
      >
        {preprocessWikilinks(processedMarkdown)}
      </ReactMarkdown>
    </div>
  )
}
