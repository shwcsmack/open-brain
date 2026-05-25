import { TRPCError } from '@trpc/server'
import { computeNextState, Rating, type Grade } from '@/lib/fsrs'
import { htmlToMarkdown } from '@/lib/htmlToMarkdown'
import { uniqueSlug } from '@/lib/slug'
import {
  canonicalWikipediaArticleUrl,
  fetchWikipediaSections,
  mergeWikipediaSections,
  wikipediaSlugFromTitleOrUrl,
} from '@/lib/wikipedia'
import type { PrismaClient } from '@/lib/generated/prisma/client'

export type WikipediaArticle = {
  title: string
  content: string
  articleUrl: string
}

export type AddUrlInput = {
  url: string
  title?: string
  content?: string
}

export type UrlPreview = {
  title: string
  content: string
}

export type WikipediaFetchInput = {
  url?: string
  input?: string
}

export type ReadingListFilters = {
  sourceType?: 'NOTE' | 'URL' | 'WIKIPEDIA' | 'EXTRACT'
  state?: 'NEW' | 'LEARNING' | 'REVIEW' | 'RELEARNING'
  sourceNoteId?: string
  parentItemId?: string
}

const ratingMap: Record<'Again' | 'Hard' | 'Good' | 'Easy', Grade> = {
  Again: Rating.Again,
  Hard: Rating.Hard,
  Good: Rating.Good,
  Easy: Rating.Easy,
}

export async function addNoteToQueue(db: PrismaClient, noteId: string) {
  const existing = await db.readingItem.findFirst({
    where: { sourceNoteId: noteId, deletedAt: null },
  })
  if (existing) return existing

  const note = await db.note.findUniqueOrThrow({ where: { id: noteId } })
  return db.readingItem.create({
    data: {
      title: note.title,
      content: note.body ?? '',
      sourceType: 'NOTE',
      sourceNoteId: noteId,
    },
  })
}

export async function listDueItems(db: PrismaClient) {
  const now = new Date()
  return db.readingItem.findMany({
    where: { deletedAt: null, archivedAt: null, due: { lte: now } },
    orderBy: [{ priority: 'desc' }, { due: 'asc' }],
  })
}

export async function listAllItems(db: PrismaClient, filters?: ReadingListFilters) {
  return db.readingItem.findMany({
    where: {
      deletedAt: null,
      archivedAt: null,
      ...(filters?.sourceType ? { sourceType: filters.sourceType } : {}),
      ...(filters?.state ? { state: filters.state } : {}),
      ...(filters?.sourceNoteId ? { sourceNoteId: filters.sourceNoteId } : {}),
      ...(filters?.parentItemId ? { parentItemId: filters.parentItemId } : {}),
    },
    orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
  })
}

function readingItemNotFound(): never {
  throw new TRPCError({ code: 'NOT_FOUND', message: 'Reading item not found' })
}

async function requireActiveReadingItem(db: PrismaClient, id: string) {
  const item = await db.readingItem.findFirst({ where: { id, deletedAt: null } })
  if (!item) readingItemNotFound()
  return item
}

export async function archiveItem(db: PrismaClient, id: string) {
  await requireActiveReadingItem(db, id)
  return db.readingItem.update({ where: { id }, data: { archivedAt: new Date() } })
}

export async function unarchiveItem(db: PrismaClient, id: string) {
  await requireActiveReadingItem(db, id)
  return db.readingItem.update({ where: { id }, data: { archivedAt: null } })
}

export async function deleteItem(db: PrismaClient, id: string) {
  const item = await requireActiveReadingItem(db, id)
  await db.readingItem.delete({ where: { id } })
  return item
}

export type HiddenPassage = { start: number; end: number }

function isHiddenPassage(entry: unknown): entry is HiddenPassage {
  if (typeof entry !== 'object' || entry === null) return false
  const { start, end } = entry as { start?: unknown; end?: unknown }
  return typeof start === 'number' && typeof end === 'number'
}

function parseHiddenPassagesJson(hiddenPassages: string): HiddenPassage[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(hiddenPassages)
  } catch {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'hiddenPassages must be valid JSON',
    })
  }
  if (!Array.isArray(parsed) || !parsed.every(isHiddenPassage)) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'hiddenPassages must be a JSON array of { start, end } objects',
    })
  }
  return parsed
}

export async function hidePassage(db: PrismaClient, id: string, start: number, end: number) {
  const item = await requireActiveReadingItem(db, id)
  const current = parseHiddenPassagesJson(item.hiddenPassages)
  const range: HiddenPassage = { start, end }
  return db.readingItem.update({
    where: { id },
    data: { hiddenPassages: JSON.stringify([...current, range]) },
  })
}

export async function restorePassage(db: PrismaClient, id: string, start: number, end: number) {
  const item = await requireActiveReadingItem(db, id)
  const current = parseHiddenPassagesJson(item.hiddenPassages)
  const idx = current.findIndex((entry) => entry.start === start && entry.end === end)
  if (idx === -1) return item
  const next = [...current.slice(0, idx), ...current.slice(idx + 1)]
  return db.readingItem.update({ where: { id }, data: { hiddenPassages: JSON.stringify(next) } })
}

export async function bulkArchive(db: PrismaClient, ids: string[]) {
  const result = await db.readingItem.updateMany({
    where: { id: { in: ids }, deletedAt: null },
    data: { archivedAt: new Date() },
  })
  return result.count
}

export async function bulkDelete(db: PrismaClient, ids: string[]) {
  const result = await db.readingItem.deleteMany({ where: { id: { in: ids } } })
  return result.count
}

export async function getItemById(db: PrismaClient, id: string) {
  return db.readingItem.findFirst({ where: { id, deletedAt: null } })
}

export async function listArchivedItems(
  db: PrismaClient,
  filters?: { sourceType?: 'NOTE' | 'URL' | 'WIKIPEDIA' | 'EXTRACT' }
) {
  return db.readingItem.findMany({
    where: {
      deletedAt: null,
      archivedAt: { not: null },
      ...(filters?.sourceType ? { sourceType: filters.sourceType } : {}),
    },
    orderBy: { archivedAt: 'desc' },
  })
}

type WikipediaImportCandidate = {
  id: string
  archivedAt: Date | null
  createdAt: Date
}

/** Active imports beat archived; within the same state, newest createdAt wins. */
function isPreferredWikipediaImport(
  candidate: WikipediaImportCandidate,
  incumbent: WikipediaImportCandidate
): boolean {
  const candidateActive = candidate.archivedAt === null
  const incumbentActive = incumbent.archivedAt === null
  if (candidateActive !== incumbentActive) return candidateActive
  return candidate.createdAt.getTime() > incumbent.createdAt.getTime()
}

export async function getImportedWikipediaUrls(
  db: PrismaClient
): Promise<Record<string, { id: string; archivedAt: Date | null }>> {
  const items = await db.readingItem.findMany({
    where: { deletedAt: null, articleUrl: { not: null } },
    select: { id: true, articleUrl: true, archivedAt: true, createdAt: true },
  })
  const winners: Record<string, WikipediaImportCandidate> = {}
  for (const item of items) {
    if (!item.articleUrl) continue
    const candidate: WikipediaImportCandidate = {
      id: item.id,
      archivedAt: item.archivedAt,
      createdAt: item.createdAt,
    }
    const incumbent = winners[item.articleUrl]
    if (!incumbent || isPreferredWikipediaImport(candidate, incumbent)) {
      winners[item.articleUrl] = candidate
    }
  }
  const map: Record<string, { id: string; archivedAt: Date | null }> = {}
  for (const [articleUrl, winner] of Object.entries(winners)) {
    map[articleUrl] = { id: winner.id, archivedAt: winner.archivedAt }
  }
  return map
}

export async function extractPassage(
  db: PrismaClient,
  parentItemId: string,
  selectedText: string
) {
  const parent = await db.readingItem.findUniqueOrThrow({ where: { id: parentItemId } })
  if (parent.deletedAt !== null) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Reading item not found' })
  }
  const title = selectedText.slice(0, 80).trim() || 'Extract'
  return db.readingItem.create({
    data: {
      title,
      content: selectedText,
      sourceType: 'EXTRACT',
      parentItemId,
      extractedText: selectedText,
    },
  })
}

export async function reviewReadingItem(
  db: PrismaClient,
  readingItemId: string,
  ratingStr: 'Again' | 'Hard' | 'Good' | 'Easy'
) {
  const item = await db.readingItem.findUniqueOrThrow({ where: { id: readingItemId } })
  if (item.deletedAt !== null) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Reading item not found' })
  }

  const next = computeNextState(
    {
      stability: item.stability,
      difficulty: item.difficulty,
      due: item.due,
      reps: item.reps,
      lapses: item.lapses,
      state: item.state,
      lastReview: item.lastReview,
    },
    ratingMap[ratingStr]
  )

  return db.readingItem.update({
    where: { id: readingItemId },
    data: {
      stability: next.stability,
      difficulty: next.difficulty,
      due: next.due,
      reps: next.reps,
      lapses: next.lapses,
      state: next.state,
      lastReview: next.lastReview,
    },
  })
}

/** Canonical field is `url`; `input` is accepted for backward compatibility. */
export function resolveWikipediaFetchTarget(input: WikipediaFetchInput): string {
  const value = input.url ?? input.input
  if (!value?.trim()) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Provide url (Wikipedia article URL or title)',
    })
  }
  return value.trim()
}

export async function fetchWikipediaForReading(
  titleOrUrl: string,
  fetchFn?: typeof fetch
): Promise<WikipediaArticle> {
  try {
    const slug = wikipediaSlugFromTitleOrUrl(titleOrUrl)
    if (!slug) {
      throw new Error('Invalid Wikipedia URL')
    }
    const sections = await fetchWikipediaSections(titleOrUrl, fetchFn)
    const title = slug.replace(/_/g, ' ')
    const articleUrl = canonicalWikipediaArticleUrl(slug)
    return mergeWikipediaSections(sections, title, articleUrl)
  } catch (err) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: err instanceof Error ? err.message : 'Failed to fetch Wikipedia article',
    })
  }
}

export async function addWikipediaToQueue(db: PrismaClient, article: WikipediaArticle) {
  return db.readingItem.create({
    data: {
      title: article.title,
      content: article.content,
      sourceType: 'WIKIPEDIA',
      url: article.articleUrl,
      articleUrl: article.articleUrl,
    },
  })
}

function extractTitleFromHtml(html: string, fallback: string): string {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  return match?.[1]?.trim() || fallback
}

function extractBodyHtml(html: string): string {
  const match = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
  return match?.[1] ?? html
}

function isHtmlContentType(contentType: string | null): boolean {
  if (!contentType) return true
  const lower = contentType.toLowerCase()
  return lower.includes('text/html') || lower.includes('application/xhtml')
}

async function fetchUrlPreviewFromHtml(
  url: string,
  fetchFn: typeof fetch = fetch
): Promise<UrlPreview> {
  let res: Response
  try {
    res = await fetchFn(url, { signal: AbortSignal.timeout(10_000) })
  } catch (err) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message:
        err instanceof Error ? err.message : 'Failed to fetch URL. Check the address and try again.',
    })
  }

  if (!res.ok) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `Failed to fetch URL: HTTP ${res.status}`,
    })
  }

  const contentType = res.headers.get('content-type')
  if (!isHtmlContentType(contentType)) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'URL did not return HTML content',
    })
  }

  const html = await res.text()
  const hostname = new URL(url).hostname
  const title = extractTitleFromHtml(html, hostname)
  const content = htmlToMarkdown(extractBodyHtml(html))

  if (!content.trim()) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Could not extract readable content from the page',
    })
  }

  return { title, content }
}

/** Fetches and parses a URL without persisting a ReadingItem. */
export async function previewUrlFromFetch(
  url: string,
  fetchFn: typeof fetch = fetch
): Promise<UrlPreview> {
  return fetchUrlPreviewFromHtml(url, fetchFn)
}

export async function addUrlToQueue(
  db: PrismaClient,
  input: AddUrlInput,
  fetchFn: typeof fetch = fetch
) {
  if (input.content !== undefined) {
    const title = input.title?.trim() || new URL(input.url).hostname
    return db.readingItem.create({
      data: {
        title,
        content: input.content,
        sourceType: 'URL',
        url: input.url,
      },
    })
  }

  const preview = await fetchUrlPreviewFromHtml(input.url, fetchFn)
  const title = input.title ?? preview.title
  return db.readingItem.create({
    data: { title, content: preview.content, sourceType: 'URL', url: input.url },
  })
}

export async function terminateAsNote(
  db: PrismaClient,
  readingItemId: string,
  titleOverride: string | undefined,
  bodyOverride?: string
) {
  const item = await db.readingItem.findUniqueOrThrow({ where: { id: readingItemId } })
  if (item.deletedAt !== null) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Reading item not found' })
  }

  const title = (titleOverride ?? item.title).trim() || 'Untitled'
  const body = (bodyOverride ?? item.content).trim()
  const slug = await uniqueSlug(title, db)
  const note = await db.note.create({
    data: {
      title,
      slug,
      body,
      sourceReadingItemId: readingItemId,
    },
  })
  await db.readingItem.update({
    where: { id: readingItemId },
    data: { deletedAt: new Date() },
  })
  return note
}
