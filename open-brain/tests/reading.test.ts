/**
 * Integration tests for reading queue logic (run with tsx — Prisma 7 client is ESM-only).
 *
 *   npx tsx --test tests/reading.test.ts
 */
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { execSync } from 'child_process'
import { describe, it, before, after, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { PrismaClient } from '@/lib/generated/prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import {
  addNoteToQueue,
  addUrlToQueue,
  addWikipediaToQueue,
  extractPassage,
  fetchWikipediaForReading,
  listAllItems,
  listDueItems,
  previewUrlFromFetch,
  resolveWikipediaFetchTarget,
  reviewReadingItem,
  terminateAsNote,
} from '@/lib/readingQueue'

let prisma: PrismaClient
let dbPath: string

before(async () => {
  dbPath = path.join(os.tmpdir(), `reading-test-${Date.now()}.db`)
  execSync(`DATABASE_URL="file:${dbPath}" npx prisma db push`, {
    cwd: path.join(__dirname, '..'),
    stdio: 'pipe',
  })
  const adapter = new PrismaBetterSqlite3({ url: `file:${dbPath}` })
  prisma = new PrismaClient({ adapter })
})

after(async () => {
  if (prisma) await prisma.$disconnect()
  if (dbPath && fs.existsSync(dbPath)) fs.unlinkSync(dbPath)
})

afterEach(async () => {
  if (!prisma) return
  await prisma.readingItem.deleteMany()
  await prisma.note.deleteMany()
})

describe('addNoteToQueue', () => {
  it('creates a ReadingItem linked to an existing note', async () => {
    const note = await prisma.note.create({
      data: { title: 'Test Note', slug: 'test-note', body: '# Hello\nworld' },
    })
    const item = await addNoteToQueue(prisma, note.id)
    assert.equal(item.sourceType, 'NOTE')
    assert.equal(item.sourceNoteId, note.id)
    assert.equal(item.content, '# Hello\nworld')
    assert.equal(item.deletedAt, null)
  })

  it('returns existing item without creating a duplicate', async () => {
    const note = await prisma.note.create({
      data: { title: 'Dup Note', slug: 'dup-note', body: 'body' },
    })
    const first = await addNoteToQueue(prisma, note.id)
    const second = await addNoteToQueue(prisma, note.id)
    assert.equal(second.id, first.id)
    const count = await prisma.readingItem.count({ where: { sourceNoteId: note.id } })
    assert.equal(count, 1)
  })
})

describe('listDueItems', () => {
  it('returns items due now, ordered by priority desc then due asc', async () => {
    const past = new Date(Date.now() - 3600_000)
    const earlier = new Date(past.getTime() - 60_000)
    const later = new Date(past.getTime() + 60_000)
    await prisma.readingItem.createMany({
      data: [
        { title: 'Low', content: '', sourceType: 'URL', priority: 20, due: later },
        { title: 'High', content: '', sourceType: 'URL', priority: 80, due: earlier },
      ],
    })
    const due = await listDueItems(prisma)
    assert.equal(due[0].title, 'High')
    assert.equal(due[1].title, 'Low')
  })

  it('excludes future items', async () => {
    const future = new Date(Date.now() + 3600_000)
    await prisma.readingItem.create({
      data: { title: 'Future', content: '', sourceType: 'URL', due: future },
    })
    const due = await listDueItems(prisma)
    assert.equal(due.length, 0)
  })

  it('excludes soft-deleted items', async () => {
    const past = new Date(Date.now() - 1000)
    await prisma.readingItem.create({
      data: { title: 'Deleted', content: '', sourceType: 'URL', due: past, deletedAt: new Date() },
    })
    const due = await listDueItems(prisma)
    assert.equal(due.length, 0)
  })
})

describe('listAllItems', () => {
  it('returns non-deleted items ordered by priority desc then createdAt desc', async () => {
    await prisma.readingItem.create({
      data: {
        title: 'Low Priority',
        content: '',
        sourceType: 'URL',
        priority: 20,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    })
    await prisma.readingItem.create({
      data: {
        title: 'High Older',
        content: '',
        sourceType: 'NOTE',
        priority: 80,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    })
    await prisma.readingItem.create({
      data: {
        title: 'High Newer',
        content: '',
        sourceType: 'EXTRACT',
        priority: 80,
        createdAt: new Date('2026-01-02T00:00:00.000Z'),
      },
    })
    await prisma.readingItem.create({
      data: {
        title: 'Deleted',
        content: '',
        sourceType: 'URL',
        priority: 100,
        deletedAt: new Date(),
      },
    })

    const items = await listAllItems(prisma)
    assert.deepEqual(items.map(item => item.title), ['High Newer', 'High Older', 'Low Priority'])
  })

  it('filters by parentItemId', async () => {
    const parent = await prisma.readingItem.create({
      data: { title: 'Parent', content: 'body', sourceType: 'URL' },
    })
    await prisma.readingItem.create({
      data: {
        title: 'Child',
        content: 'extract',
        sourceType: 'EXTRACT',
        parentItemId: parent.id,
        extractedText: 'extract',
      },
    })
    await prisma.readingItem.create({
      data: { title: 'Other', content: '', sourceType: 'URL' },
    })

    const items = await listAllItems(prisma, { parentItemId: parent.id })
    assert.deepEqual(items.map(item => item.title), ['Child'])
  })

  it('filters by sourceType and state', async () => {
    await prisma.readingItem.createMany({
      data: [
        { title: 'Wiki Review', content: '', sourceType: 'WIKIPEDIA_SECTION', state: 'REVIEW' },
        { title: 'Wiki New', content: '', sourceType: 'WIKIPEDIA_SECTION', state: 'NEW' },
        { title: 'Url Review', content: '', sourceType: 'URL', state: 'REVIEW' },
      ],
    })

    const items = await listAllItems(prisma, { sourceType: 'WIKIPEDIA_SECTION', state: 'REVIEW' })
    assert.deepEqual(items.map(item => item.title), ['Wiki Review'])
  })
})

describe('extractPassage', () => {
  it('creates a child ReadingItem with parentItemId and extractedText', async () => {
    const parent = await prisma.readingItem.create({
      data: { title: 'Parent', content: 'long content', sourceType: 'URL' },
    })
    const child = await extractPassage(prisma, parent.id, 'long content')
    assert.equal(child.parentItemId, parent.id)
    assert.equal(child.extractedText, 'long content')
    assert.equal(child.sourceType, 'EXTRACT')
    assert.equal(child.deletedAt, null)
    assert.ok(child.due.getTime() <= Date.now() + 1000)
  })

  it('derives title from first 80 chars of selected text', async () => {
    const parent = await prisma.readingItem.create({
      data: { title: 'Parent', content: 'x'.repeat(200), sourceType: 'URL' },
    })
    const longText = 'A'.repeat(100)
    const child = await extractPassage(prisma, parent.id, longText)
    assert.equal(child.title, 'A'.repeat(80))
  })
})

describe('reviewReadingItem', () => {
  it('advances FSRS state from NEW after a Good rating', async () => {
    const item = await prisma.readingItem.create({
      data: { title: 'Item', content: '', sourceType: 'URL', state: 'NEW', reps: 0 },
    })
    const updated = await reviewReadingItem(prisma, item.id, 'Good')
    assert.equal(updated.reps, 1)
    assert.ok(updated.due.getTime() > Date.now())
    assert.ok(['LEARNING', 'REVIEW'].includes(updated.state))
  })

  it('increments lapses and sets near-future due on Again rating', async () => {
    const item = await prisma.readingItem.create({
      data: {
        title: 'Item',
        content: '',
        sourceType: 'URL',
        state: 'REVIEW',
        stability: 10,
        difficulty: 5,
        reps: 5,
      },
    })
    const updated = await reviewReadingItem(prisma, item.id, 'Again')
    assert.equal(updated.lapses, 1)
    const tenMinutes = Date.now() + 10 * 60 * 1000
    assert.ok(updated.due.getTime() < tenMinutes)
  })
})

const mockWikipediaResponse = {
  lead: {
    displaytitle: 'Mitochondria',
    sections: [{ id: 0, text: '<p>The mitochondrion is a double-membrane-bound organelle.</p>' }],
  },
  remaining: {
    sections: [
      { id: 1, anchor: 'Structure', line: 'Structure', text: '<p>The inner membrane.</p>' },
    ],
  },
}

const mockWikipediaParseResponse = {
  parse: {
    title: 'Mitochondrion',
    text: [
      '<p>Lead with <a href="/wiki/Organelle">organelle</a>.</p>',
      '<h2 id="Structure">Structure</h2>',
      '<p>Body with <a href="/wiki/Cell">cell</a>.</p>',
    ].join(''),
    sections: [{ toclevel: 1, line: 'Structure', anchor: 'Structure' }],
  },
}

describe('resolveWikipediaFetchTarget', () => {
  it('uses canonical url field (Wikipedia URL)', () => {
    assert.equal(
      resolveWikipediaFetchTarget({
        url: 'https://en.wikipedia.org/wiki/Mitochondria',
      }),
      'https://en.wikipedia.org/wiki/Mitochondria'
    )
  })

  it('accepts plain title via url field', () => {
    assert.equal(resolveWikipediaFetchTarget({ url: 'Mitochondria' }), 'Mitochondria')
  })

  it('falls back to legacy input field', () => {
    assert.equal(resolveWikipediaFetchTarget({ input: 'Mitochondria' }), 'Mitochondria')
  })

  it('prefers url over input when both are provided', () => {
    assert.equal(
      resolveWikipediaFetchTarget({
        url: 'https://en.wikipedia.org/wiki/Mitochondria',
        input: 'Other',
      }),
      'https://en.wikipedia.org/wiki/Mitochondria'
    )
  })
})

describe('fetchWikipediaForReading', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('fetches sections when resolved from { url } (mocked HTTP)', async () => {
    global.fetch = async () =>
      new Response(JSON.stringify(mockWikipediaResponse), { status: 200 })

    const target = resolveWikipediaFetchTarget({
      url: 'https://en.wikipedia.org/wiki/Mitochondria',
    })
    const sections = await fetchWikipediaForReading(target)
    assert.equal(sections.length, 2)
    assert.equal(sections[0].sectionTitle, 'Introduction')
  })

  it('fetches sections from a Wikipedia URL (mocked HTTP)', async () => {
    global.fetch = async () =>
      new Response(JSON.stringify(mockWikipediaResponse), { status: 200 })

    const sections = await fetchWikipediaForReading(
      'https://en.wikipedia.org/wiki/Mitochondria'
    )
    assert.equal(sections.length, 2)
    assert.equal(sections[0].sectionTitle, 'Introduction')
    assert.equal(sections[0].title, 'Introduction')
    assert.ok(sections[0].content.includes('mitochondrion'))
    assert.equal(sections[0].articleUrl, 'https://en.wikipedia.org/wiki/Mitochondria')
    assert.equal(sections[1].sectionTitle, 'Structure')
  })

  it('accepts a plain article title', async () => {
    global.fetch = async () =>
      new Response(JSON.stringify(mockWikipediaResponse), { status: 200 })

    const sections = await fetchWikipediaForReading('Mitochondria')
    assert.equal(sections.length, 2)
  })

  it('absolutizes Wikipedia-relative links in parsed article content', async () => {
    global.fetch = async () =>
      new Response(JSON.stringify(mockWikipediaParseResponse), { status: 200 })

    const sections = await fetchWikipediaForReading('Mitochondrion')
    assert.ok(sections[0].content.includes('https://en.wikipedia.org/wiki/Organelle'))
    assert.ok(sections[1].content.includes('https://en.wikipedia.org/wiki/Cell'))
    assert.ok(!sections.some(section => section.content.includes('](/wiki/')))
  })

  it('throws on 404 with a descriptive message', async () => {
    global.fetch = async () => new Response('', { status: 404 })

    await assert.rejects(
      () => fetchWikipediaForReading('Nonexistent_Article_Xyz'),
      /not found/i
    )
  })

  it('throws on network failure', async () => {
    global.fetch = async () => {
      throw new TypeError('fetch failed')
    }

    await assert.rejects(
      () => fetchWikipediaForReading('Mitochondria'),
      /network/i
    )
  })
})

describe('addWikipediaToQueue', () => {
  it('creates one ReadingItem per section with WIKIPEDIA_SECTION', async () => {
    const articleUrl = 'https://en.wikipedia.org/wiki/Mitochondria'
    const items = await addWikipediaToQueue(prisma, [
      {
        title: 'Introduction',
        content: 'Lead paragraph.',
        articleUrl,
        sectionTitle: 'Introduction',
      },
      {
        title: 'Structure',
        content: 'Inner membrane.',
        articleUrl,
        sectionTitle: 'Structure',
      },
    ])

    assert.equal(items.length, 2)
    assert.equal(items[0].sourceType, 'WIKIPEDIA_SECTION')
    assert.equal(items[0].articleUrl, articleUrl)
    assert.equal(items[0].sectionTitle, 'Introduction')
    assert.equal(items[0].url, articleUrl)
    assert.equal(items[1].sectionTitle, 'Structure')

    const count = await prisma.readingItem.count({ where: { sourceType: 'WIKIPEDIA_SECTION' } })
    assert.equal(count, 2)
  })
})

describe('previewUrlFromFetch', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('returns title and content without creating a ReadingItem', async () => {
    const html = `<!DOCTYPE html><html><head><title>Preview Page</title></head><body><p>Preview body</p></body></html>`
    global.fetch = async () => new Response(html, { status: 200, headers: { 'content-type': 'text/html' } })

    const before = await prisma.readingItem.count()
    const preview = await previewUrlFromFetch('https://example.com/preview')
    const after = await prisma.readingItem.count()

    assert.equal(before, after)
    assert.equal(preview.title, 'Preview Page')
    assert.ok(preview.content.includes('Preview body'))
  })
})

describe('addUrlToQueue', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('preview then confirm creates exactly one row (no double insert)', async () => {
    const html = `<!DOCTYPE html><html><head><title>Flow Page</title></head><body><p>Flow content</p></body></html>`
    global.fetch = async () => new Response(html, { status: 200, headers: { 'content-type': 'text/html' } })

    const preview = await previewUrlFromFetch('https://example.com/flow')
    const before = await prisma.readingItem.count({ where: { sourceType: 'URL' } })
    const item = await addUrlToQueue(prisma, {
      url: 'https://example.com/flow',
      title: preview.title,
      content: preview.content,
    })
    const after = await prisma.readingItem.count({ where: { sourceType: 'URL' } })

    assert.equal(after - before, 1)
    assert.equal(item.title, 'Flow Page')
    assert.ok(item.content.includes('Flow content'))
  })

  it('confirm with title and content creates exactly one ReadingItem', async () => {
    let fetchCalled = false
    global.fetch = async () => {
      fetchCalled = true
      return new Response('', { status: 200 })
    }

    const before = await prisma.readingItem.count({ where: { sourceType: 'URL' } })
    const item = await addUrlToQueue(prisma, {
      url: 'https://example.com/confirmed',
      title: 'Confirmed Title',
      content: 'Confirmed markdown body',
    })
    const after = await prisma.readingItem.count({ where: { sourceType: 'URL' } })

    assert.equal(fetchCalled, false)
    assert.equal(after - before, 1)
    assert.equal(item.title, 'Confirmed Title')
    assert.equal(item.content, 'Confirmed markdown body')
    assert.equal(item.url, 'https://example.com/confirmed')
  })

  it('creates a URL ReadingItem from fetched HTML (mocked HTTP)', async () => {
    const html = `<!DOCTYPE html><html><head><title>Example Page</title></head><body><p>Hello world</p></body></html>`
    global.fetch = async () => new Response(html, { status: 200, headers: { 'content-type': 'text/html' } })

    const item = await addUrlToQueue(prisma, { url: 'https://example.com/article' })
    assert.equal(item.sourceType, 'URL')
    assert.equal(item.url, 'https://example.com/article')
    assert.equal(item.title, 'Example Page')
    assert.ok(item.content.includes('Hello world'))
  })

  it('uses provided title and content without fetching', async () => {
    let fetchCalled = false
    global.fetch = async () => {
      fetchCalled = true
      return new Response('', { status: 200 })
    }

    const item = await addUrlToQueue(prisma, {
      url: 'https://example.com/manual',
      title: 'Manual Title',
      content: '# Pasted\n\nBody',
    })
    assert.equal(fetchCalled, false)
    assert.equal(item.title, 'Manual Title')
    assert.equal(item.content, '# Pasted\n\nBody')
  })

  it('does not create a ReadingItem when fetch fails', async () => {
    global.fetch = async () => new Response('', { status: 500 })

    await assert.rejects(
      () => addUrlToQueue(prisma, { url: 'https://example.com/broken' }),
      /HTTP 500|fetch/i
    )
    const count = await prisma.readingItem.count({ where: { sourceType: 'URL' } })
    assert.equal(count, 0)
  })

  it('does not create a ReadingItem when response is not HTML', async () => {
    global.fetch = async () =>
      new Response('not html', { status: 200, headers: { 'content-type': 'application/json' } })

    await assert.rejects(
      () => addUrlToQueue(prisma, { url: 'https://example.com/json' }),
      /HTML|content/i
    )
    const count = await prisma.readingItem.count()
    assert.equal(count, 0)
  })
})

describe('terminateAsNote', () => {
  it('creates a Note and soft-deletes the ReadingItem', async () => {
    const item = await prisma.readingItem.create({
      data: { title: 'Extract Title', content: 'The key insight.', sourceType: 'EXTRACT' },
    })
    const note = await terminateAsNote(prisma, item.id, undefined)
    assert.equal(note.title, 'Extract Title')
    assert.equal(note.body, 'The key insight.')
    assert.equal(note.sourceReadingItemId, item.id)
    const updated = await prisma.readingItem.findUnique({ where: { id: item.id } })
    assert.notEqual(updated?.deletedAt, null)
  })

  it('uses provided title override', async () => {
    const item = await prisma.readingItem.create({
      data: { title: 'Original', content: 'content', sourceType: 'EXTRACT' },
    })
    const note = await terminateAsNote(prisma, item.id, 'My Custom Title')
    assert.equal(note.title, 'My Custom Title')
  })

  it('uses provided body override', async () => {
    const item = await prisma.readingItem.create({
      data: { title: 'Original', content: 'full article', sourceType: 'URL' },
    })
    const note = await terminateAsNote(prisma, item.id, 'Selection title', 'selected passage')
    assert.equal(note.body, 'selected passage')
  })
})
