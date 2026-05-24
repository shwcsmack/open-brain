import { TRPCError } from '@trpc/server'
import { computeNextState, Rating, type Grade } from '@/lib/fsrs'
import { htmlToMarkdown } from '@/lib/htmlToMarkdown'
import { uniqueSlug } from '@/lib/slug'
import { fetchWikipediaSections } from '@/lib/wikipedia'
import type { PrismaClient } from '@/lib/generated/prisma/client'

export type WikipediaFetchedSection = {
  title: string
  content: string
  articleUrl: string
  sectionTitle: string
}

export type WikipediaQueueInput = {
  title: string
  content: string
  articleUrl: string
  sectionTitle: string
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
  sourceType?: 'NOTE' | 'URL' | 'WIKIPEDIA_SECTION' | 'EXTRACT'
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
    where: { deletedAt: null, due: { lte: now } },
    orderBy: [{ priority: 'desc' }, { due: 'asc' }],
  })
}

export async function listAllItems(db: PrismaClient, filters?: ReadingListFilters) {
  return db.readingItem.findMany({
    where: {
      deletedAt: null,
      ...(filters?.sourceType ? { sourceType: filters.sourceType } : {}),
      ...(filters?.state ? { state: filters.state } : {}),
      ...(filters?.sourceNoteId ? { sourceNoteId: filters.sourceNoteId } : {}),
      ...(filters?.parentItemId ? { parentItemId: filters.parentItemId } : {}),
    },
    orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
  })
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
): Promise<WikipediaFetchedSection[]> {
  try {
    const sections = await fetchWikipediaSections(titleOrUrl, fetchFn)
    return sections.map(s => ({
      title: s.sectionTitle,
      content: s.content,
      articleUrl: s.articleUrl,
      sectionTitle: s.sectionTitle,
    }))
  } catch (err) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: err instanceof Error ? err.message : 'Failed to fetch Wikipedia article',
    })
  }
}

export async function addWikipediaToQueue(db: PrismaClient, sections: WikipediaQueueInput[]) {
  if (sections.length === 0) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'No sections to add' })
  }
  return Promise.all(
    sections.map(section =>
      db.readingItem.create({
        data: {
          title: section.title,
          content: section.content,
          sourceType: 'WIKIPEDIA_SECTION',
          url: section.articleUrl,
          articleUrl: section.articleUrl,
          sectionTitle: section.sectionTitle,
        },
      })
    )
  )
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
