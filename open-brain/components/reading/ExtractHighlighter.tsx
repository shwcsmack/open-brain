'use client'
import { useMemo, type ReactNode } from 'react'
import type { Link, Root, Text } from 'mdast'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { fromMarkdown } from 'mdast-util-from-markdown'
import { gfmFromMarkdown } from 'mdast-util-gfm'
import { gfm } from 'micromark-extension-gfm'
import { visit } from 'unist-util-visit'
import { preprocessWikilinks } from '@/components/editor/NoteViewer'
import { tombstonePlainBounds } from '@/components/reading/plainTextOffset'
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

export interface HiddenPassage {
  start: number
  end: number
}

interface Props {
  markdown: string
  extractedTexts: string[]
  hiddenPassages?: HiddenPassage[]
  importedWikipediaUrls?: Record<string, WikipediaImportState>
  onAddWikipediaLink?: (url: string) => void
  onRestorePassage?: (passage: HiddenPassage) => void
  onRestorePassages?: (passages: HiddenPassage[]) => void
}

function isWikipediaUrl(href: string): boolean {
  try {
    return new URL(href).hostname.endsWith('wikipedia.org')
  } catch {
    return false
  }
}

export function isWikipediaFileUrl(href: string): boolean {
  try {
    const u = new URL(href)
    if (!u.hostname.endsWith('wikipedia.org')) return false
    const parts = u.pathname.split('/')
    const wikiIdx = parts.indexOf('wiki')
    if (wikiIdx === -1 || wikiIdx + 1 >= parts.length) return false
    return /^File:/i.test(decodeURIComponent(parts[wikiIdx + 1]))
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

function passagesEqual(a: HiddenPassage, b: HiddenPassage): boolean {
  return a.start === b.start && a.end === b.end
}

function addPassageToGroup(passages: HiddenPassage[], passage: HiddenPassage): void {
  if (!passages.some((p) => passagesEqual(p, passage))) passages.push(passage)
}

function wikipediaActionSuffix(state: 'unimported' | 'active' | 'archived'): string {
  if (state === 'unimported') return ', add to reading queue'
  if (state === 'archived') return ', open archived Wikipedia article'
  return ', open Wikipedia article'
}

/** Plain text from mdast `text` nodes only; paragraph breaks add no separator (e.g. `a\n\nb` → `ab`). */
export function buildPlainTextMap(markdown: string): {
  plainText: string
  offsets: number[]
} {
  const tree = fromMarkdown(markdown, {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  }) as Root
  const chars: string[] = []
  const offsets: number[] = []

  visit(tree, 'text', (node: Text) => {
    if (!node.position) return
    const mdStart = node.position.start.offset ?? 0
    for (let i = 0; i < node.value.length; i++) {
      chars.push(node.value[i])
      offsets.push(mdStart + i)
    }
  })

  return { plainText: chars.join(''), offsets }
}

function parseMarkdownAst(markdown: string): Root {
  return fromMarkdown(markdown, {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  }) as Root
}

/** When a hidden range lies in link label text, replace the full `[label](url)` span. */
function expandMdRangeForEmbeddedLinks(
  tree: Root,
  mdStart: number,
  mdEnd: number,
): { mdStart: number; mdEnd: number } {
  let start = mdStart
  let end = mdEnd
  visit(tree, 'link', (node: Link) => {
    const pos = node.position
    if (!pos) return
    const linkStart = pos.start.offset ?? 0
    const linkEnd = pos.end.offset ?? 0
    if (mdStart < linkStart || mdEnd > linkEnd) return

    let labelStart: number | undefined
    let labelEnd: number | undefined
    visit(node, 'text', (text: Text) => {
      if (!text.position) return
      const s = text.position.start.offset ?? 0
      const e = text.position.end.offset ?? 0
      labelStart = labelStart === undefined ? s : Math.min(labelStart, s)
      labelEnd = labelEnd === undefined ? e : Math.max(labelEnd, e)
    })

    if (
      labelStart !== undefined &&
      labelEnd !== undefined &&
      mdStart >= labelStart &&
      mdEnd <= labelEnd
    ) {
      start = Math.min(start, linkStart)
      end = Math.max(end, linkEnd)
    }
  })
  return { mdStart: start, mdEnd: end }
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

export function markHiddenPassages(
  markdown: string,
  passages: HiddenPassage[]
): { md: string; restoreMap: Record<string, HiddenPassage[]> } {
  if (passages.length === 0) return { md: markdown, restoreMap: {} }

  const tree = parseMarkdownAst(markdown)
  const { offsets } = buildPlainTextMap(markdown)

  interface MdRange {
    mdStart: number
    mdEnd: number
    passage: HiddenPassage
  }

  const mdRanges: MdRange[] = []
  for (const p of passages) {
    if (p.end <= p.start) continue
    const mdStart = offsets[p.start]
    const lastCharMdPos = offsets[p.end - 1]
    if (mdStart === undefined || lastCharMdPos === undefined) continue
    let mdEnd = lastCharMdPos + 1
    const expanded = expandMdRangeForEmbeddedLinks(tree, mdStart, mdEnd)
    mdRanges.push({ mdStart: expanded.mdStart, mdEnd: expanded.mdEnd, passage: p })
  }

  if (mdRanges.length === 0) return { md: markdown, restoreMap: {} }

  mdRanges.sort((a, b) => a.mdStart - b.mdStart)

  const merged: { mdStart: number; mdEnd: number; passages: HiddenPassage[]; key: string }[] =
    []
  let groupCounter = 0

  for (const r of mdRanges) {
    const last = merged[merged.length - 1]
    if (last && r.mdStart <= last.mdEnd) {
      last.mdEnd = Math.max(last.mdEnd, r.mdEnd)
      addPassageToGroup(last.passages, r.passage)
    } else if (last) {
      const gap = markdown.slice(last.mdEnd, r.mdStart)
      if (/^\s*$/.test(gap)) {
        last.mdEnd = r.mdEnd
        addPassageToGroup(last.passages, r.passage)
      } else {
        merged.push({
          mdStart: r.mdStart,
          mdEnd: r.mdEnd,
          passages: [r.passage],
          key: `restore-group-${groupCounter++}`,
        })
      }
    } else {
      merged.push({
        mdStart: r.mdStart,
        mdEnd: r.mdEnd,
        passages: [r.passage],
        key: `restore-group-${groupCounter++}`,
      })
    }
  }

  const restoreMap: Record<string, HiddenPassage[]> = {}
  for (const m of merged) {
    restoreMap[m.key] = m.passages
  }

  let result = markdown
  for (const m of [...merged].sort((a, b) => b.mdStart - a.mdStart)) {
    const count = m.passages.length
    const label = count === 1 ? '1 passage hidden' : `${count} passages hidden`
    result = result.slice(0, m.mdStart) + `[${label}](#${m.key})` + result.slice(m.mdEnd)
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
      className={`not-prose select-text inline-flex min-h-6 min-w-6 cursor-pointer items-center gap-1 rounded-sm border border-transparent bg-transparent p-0 text-primary underline ${FOCUS_RING}`}
    >
      <span className="underline select-text">{children}</span>
      <span className="sr-only" data-plain-offset-ignore="true">
        {wikipediaActionSuffix(state)}
      </span>
      <span className={pillClassName} aria-hidden="true" data-plain-offset-ignore="true">
        {pillLabel}
      </span>
    </button>
  )
}

function PassageTombstone({
  count,
  plainStart,
  plainEnd,
  onRestore,
}: {
  count: number
  plainStart: number
  plainEnd: number
  onRestore: () => void
}) {
  const label = count === 1 ? '1 passage hidden' : `${count} passages hidden`
  const restoreAriaLabel =
    count === 1 ? 'Restore 1 hidden passage' : `Restore ${count} hidden passages`

  return (
    <span
      role="group"
      aria-label={label}
      data-plain-start={plainStart}
      data-plain-end={plainEnd}
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
    let md = preprocessWikilinks(markdown)
    let restoreMap: Record<string, HiddenPassage[]> = {}
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
              const passages = restoreMap[key]
              if (passages?.length && (onRestorePassages || onRestorePassage)) {
                const { plainStart, plainEnd } = tombstonePlainBounds(passages)
                return (
                  <PassageTombstone
                    count={passages.length}
                    plainStart={plainStart}
                    plainEnd={plainEnd}
                    onRestore={() => {
                      if (onRestorePassages) onRestorePassages(passages)
                      else if (onRestorePassage) {
                        for (const p of passages) onRestorePassage(p)
                      }
                    }}
                  />
                )
              }
              return <span>{children}</span>
            }

            const wiki = href && isWikipediaUrl(href) && !isWikipediaFileUrl(href)
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
        {processedMarkdown}
      </ReactMarkdown>
    </div>
  )
}
