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
import { TRPCError } from '@trpc/server'
import { PrismaClient } from '@/lib/generated/prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { mergeWikipediaSections } from '@/lib/wikipedia'
import {
  addNoteToQueue,
  addUrlToQueue,
  addWikipediaToQueue,
  archiveItem,
  bulkArchive,
  bulkDelete,
  deleteItem,
  extractPassage,
  fetchWikipediaForReading,
  getImportedWikipediaUrls,
  getItemById,
  hidePassage,
  restorePassage,
  listAllItems,
  listArchivedItems,
  listDueItems,
  previewUrlFromFetch,
  resolveWikipediaFetchTarget,
  reviewReadingItem,
  terminateAsNote,
  unarchiveItem,
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

  it('excludes archived items', async () => {
    const past = new Date(Date.now() - 1000)
    await prisma.readingItem.create({
      data: {
        title: 'Archived',
        content: '',
        sourceType: 'URL',
        due: past,
        archivedAt: new Date(),
      },
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
        { title: 'Wiki Review', content: '', sourceType: 'WIKIPEDIA', state: 'REVIEW' },
        { title: 'Wiki New', content: '', sourceType: 'WIKIPEDIA', state: 'NEW' },
        { title: 'Url Review', content: '', sourceType: 'URL', state: 'REVIEW' },
      ],
    })

    const items = await listAllItems(prisma, { sourceType: 'WIKIPEDIA', state: 'REVIEW' })
    assert.deepEqual(items.map(item => item.title), ['Wiki Review'])
  })

  it('excludes archived items', async () => {
    await prisma.readingItem.create({
      data: { title: 'Active', content: '', sourceType: 'URL' },
    })
    await prisma.readingItem.create({
      data: { title: 'Archived', content: '', sourceType: 'URL', archivedAt: new Date() },
    })
    const items = await listAllItems(prisma)
    assert.deepEqual(items.map(item => item.title), ['Active'])
  })
})

describe('archiveItem', () => {
  it('rejects soft-deleted items without setting archivedAt', async () => {
    const item = await prisma.readingItem.create({
      data: { title: 'Soft deleted', content: '', sourceType: 'URL', deletedAt: new Date() },
    })
    await assert.rejects(() => archiveItem(prisma, item.id), assertNotFoundTrpcError)
    const raw = await prisma.readingItem.findUnique({ where: { id: item.id } })
    assert.equal(raw?.archivedAt, null)
  })

  it('sets archivedAt and hides item from listDueItems and listAllItems', async () => {
    const past = new Date(Date.now() - 1000)
    const item = await prisma.readingItem.create({
      data: { title: 'Wiki', content: '', sourceType: 'WIKIPEDIA', due: past },
    })
    const archived = await archiveItem(prisma, item.id)
    assert.ok(archived.archivedAt instanceof Date)
    const due = await listDueItems(prisma)
    const all = await listAllItems(prisma)
    assert.equal(due.length, 0)
    assert.equal(all.length, 0)
  })
})

describe('unarchiveItem', () => {
  it('rejects soft-deleted items without clearing archivedAt', async () => {
    const archivedAt = new Date()
    const item = await prisma.readingItem.create({
      data: {
        title: 'Soft deleted archived',
        content: '',
        sourceType: 'URL',
        archivedAt,
        deletedAt: new Date(),
      },
    })
    await assert.rejects(() => unarchiveItem(prisma, item.id), assertNotFoundTrpcError)
    const raw = await prisma.readingItem.findUnique({ where: { id: item.id } })
    assert.ok(raw?.archivedAt instanceof Date)
    assert.equal(raw?.archivedAt?.getTime(), archivedAt.getTime())
  })

  it('clears archivedAt and restores past-due item to listDueItems', async () => {
    const past = new Date(Date.now() - 1000)
    const item = await prisma.readingItem.create({
      data: {
        title: 'Archived',
        content: '',
        sourceType: 'URL',
        due: past,
        archivedAt: new Date(),
      },
    })
    const restored = await unarchiveItem(prisma, item.id)
    assert.equal(restored.archivedAt, null)
    const due = await listDueItems(prisma)
    assert.equal(due.length, 1)
    assert.equal(due[0].id, item.id)
  })
})

describe('deleteItem', () => {
  it('permanently removes the row and returns the deleted item', async () => {
    const item = await prisma.readingItem.create({
      data: { title: 'Gone', content: '', sourceType: 'URL' },
    })
    const deleted = await deleteItem(prisma, item.id)
    assert.equal(deleted.id, item.id)
    assert.equal(deleted.title, 'Gone')
    const raw = await prisma.readingItem.findUnique({ where: { id: item.id } })
    assert.equal(raw, null)
  })

  it('rejects soft-deleted items without removing the row', async () => {
    const item = await prisma.readingItem.create({
      data: { title: 'Soft deleted', content: '', sourceType: 'URL', deletedAt: new Date() },
    })
    await assert.rejects(() => deleteItem(prisma, item.id), assertNotFoundTrpcError)
    const raw = await prisma.readingItem.findUnique({ where: { id: item.id } })
    assert.ok(raw)
  })
})

const missingReadingItemId = '00000000-0000-0000-0000-000000000000'

function assertNotFoundTrpcError(err: unknown): boolean {
  assert.ok(err instanceof TRPCError)
  assert.equal(err.code, 'NOT_FOUND')
  assert.equal(err.message, 'Reading item not found')
  return true
}

describe('reading item NOT_FOUND contract', () => {
  it('archiveItem rejects missing id', async () => {
    await assert.rejects(() => archiveItem(prisma, missingReadingItemId), assertNotFoundTrpcError)
  })

  it('unarchiveItem rejects missing id', async () => {
    await assert.rejects(() => unarchiveItem(prisma, missingReadingItemId), assertNotFoundTrpcError)
  })

  it('deleteItem rejects missing id', async () => {
    await assert.rejects(() => deleteItem(prisma, missingReadingItemId), assertNotFoundTrpcError)
  })

  it('hidePassage rejects missing id', async () => {
    await assert.rejects(
      () => hidePassage(prisma, missingReadingItemId, 0, 4),
      assertNotFoundTrpcError
    )
  })

  it('restorePassage rejects missing id', async () => {
    await assert.rejects(
      () => restorePassage(prisma, missingReadingItemId, 0, 4),
      assertNotFoundTrpcError
    )
  })
})

describe('bulkArchive', () => {
  it('ignores soft-deleted IDs in count and leaves them unchanged', async () => {
    const active = await prisma.readingItem.create({
      data: { title: 'Active', content: '', sourceType: 'URL' },
    })
    const softDeleted = await prisma.readingItem.create({
      data: { title: 'Soft deleted', content: '', sourceType: 'URL', deletedAt: new Date() },
    })
    const count = await bulkArchive(prisma, [active.id, softDeleted.id])
    assert.equal(count, 1)
    const activeRaw = await prisma.readingItem.findUnique({ where: { id: active.id } })
    const softRaw = await prisma.readingItem.findUnique({ where: { id: softDeleted.id } })
    assert.ok(activeRaw?.archivedAt instanceof Date)
    assert.equal(softRaw?.archivedAt, null)
  })

  it('archives matching items and returns count', async () => {
    const a = await prisma.readingItem.create({
      data: { title: 'A', content: '', sourceType: 'URL' },
    })
    const b = await prisma.readingItem.create({
      data: { title: 'B', content: '', sourceType: 'URL' },
    })
    await prisma.readingItem.create({
      data: { title: 'C', content: '', sourceType: 'URL' },
    })
    const count = await bulkArchive(prisma, [a.id, b.id])
    assert.equal(count, 2)
    const all = await listAllItems(prisma)
    assert.deepEqual(all.map(item => item.title), ['C'])
  })
})

describe('bulkDelete', () => {
  it('permanently deletes matching rows and returns count', async () => {
    const a = await prisma.readingItem.create({
      data: { title: 'A', content: '', sourceType: 'URL' },
    })
    const b = await prisma.readingItem.create({
      data: { title: 'B', content: '', sourceType: 'URL' },
    })
    await prisma.readingItem.create({
      data: { title: 'C', content: '', sourceType: 'URL' },
    })
    const count = await bulkDelete(prisma, [a.id, b.id])
    assert.equal(count, 2)
    const remaining = await prisma.readingItem.count()
    assert.equal(remaining, 1)
  })
})

describe('getItemById', () => {
  it('returns active item', async () => {
    const item = await prisma.readingItem.create({
      data: { title: 'Active', content: '', sourceType: 'URL' },
    })
    const found = await getItemById(prisma, item.id)
    assert.equal(found?.id, item.id)
    assert.equal(found?.archivedAt, null)
  })

  it('returns archived item', async () => {
    const archivedAt = new Date()
    const item = await prisma.readingItem.create({
      data: { title: 'Archived', content: '', sourceType: 'URL', archivedAt },
    })
    const found = await getItemById(prisma, item.id)
    assert.equal(found?.id, item.id)
    assert.ok(found?.archivedAt instanceof Date)
    assert.equal(found?.archivedAt?.getTime(), archivedAt.getTime())
  })

  it('returns null for soft-deleted item', async () => {
    const item = await prisma.readingItem.create({
      data: { title: 'Deleted', content: '', sourceType: 'URL', deletedAt: new Date() },
    })
    const found = await getItemById(prisma, item.id)
    assert.equal(found, null)
  })

  it('returns null for hard-deleted item', async () => {
    const item = await prisma.readingItem.create({
      data: { title: 'Gone', content: '', sourceType: 'URL' },
    })
    await deleteItem(prisma, item.id)
    const found = await getItemById(prisma, item.id)
    assert.equal(found, null)
  })

  it('returns null for missing id', async () => {
    const found = await getItemById(prisma, '00000000-0000-0000-0000-000000000000')
    assert.equal(found, null)
  })
})

describe('listArchivedItems', () => {
  it('returns archived items ordered by archivedAt desc', async () => {
    const t1 = new Date(Date.now() - 2000)
    const t2 = new Date(Date.now() - 1000)
    await prisma.readingItem.create({
      data: { title: 'Older', content: '', sourceType: 'URL', archivedAt: t1 },
    })
    await prisma.readingItem.create({
      data: { title: 'Newer', content: '', sourceType: 'URL', archivedAt: t2 },
    })
    await prisma.readingItem.create({
      data: { title: 'Active', content: '', sourceType: 'URL' },
    })
    const items = await listArchivedItems(prisma)
    assert.equal(items.length, 2)
    assert.deepEqual(items.map(item => item.title), ['Newer', 'Older'])
  })

  it('excludes soft-deleted archived items', async () => {
    await prisma.readingItem.create({
      data: {
        title: 'Deleted archived',
        content: '',
        sourceType: 'URL',
        archivedAt: new Date(),
        deletedAt: new Date(),
      },
    })
    await prisma.readingItem.create({
      data: { title: 'Still archived', content: '', sourceType: 'URL', archivedAt: new Date() },
    })
    const items = await listArchivedItems(prisma)
    assert.deepEqual(items.map(item => item.title), ['Still archived'])
  })

  it('filters by sourceType', async () => {
    await prisma.readingItem.create({
      data: { title: 'Wiki archived', content: '', sourceType: 'WIKIPEDIA', archivedAt: new Date() },
    })
    await prisma.readingItem.create({
      data: { title: 'Url archived', content: '', sourceType: 'URL', archivedAt: new Date() },
    })
    const items = await listArchivedItems(prisma, { sourceType: 'WIKIPEDIA' })
    assert.deepEqual(items.map(item => item.title), ['Wiki archived'])
  })
})

describe('getImportedWikipediaUrls', () => {
  it('returns map of articleUrl to { id, archivedAt } for active and archived, excludes deleted', async () => {
    const active = await prisma.readingItem.create({
      data: {
        title: 'Active Wiki',
        content: '',
        sourceType: 'WIKIPEDIA',
        articleUrl: 'https://en.wikipedia.org/wiki/Active',
      },
    })
    const archivedAt = new Date()
    const archived = await prisma.readingItem.create({
      data: {
        title: 'Archived Wiki',
        content: '',
        sourceType: 'WIKIPEDIA',
        articleUrl: 'https://en.wikipedia.org/wiki/Archived',
        archivedAt,
      },
    })
    await prisma.readingItem.create({
      data: {
        title: 'Deleted Wiki',
        content: '',
        sourceType: 'WIKIPEDIA',
        articleUrl: 'https://en.wikipedia.org/wiki/Deleted',
        deletedAt: new Date(),
      },
    })
    await prisma.readingItem.create({
      data: { title: 'No URL', content: '', sourceType: 'WIKIPEDIA' },
    })
    const map = await getImportedWikipediaUrls(prisma)
    assert.ok('https://en.wikipedia.org/wiki/Active' in map)
    assert.equal(map['https://en.wikipedia.org/wiki/Active'].id, active.id)
    assert.equal(map['https://en.wikipedia.org/wiki/Active'].archivedAt, null)
    assert.ok('https://en.wikipedia.org/wiki/Archived' in map)
    assert.equal(map['https://en.wikipedia.org/wiki/Archived'].id, archived.id)
    assert.ok(map['https://en.wikipedia.org/wiki/Archived'].archivedAt instanceof Date)
    assert.equal(
      map['https://en.wikipedia.org/wiki/Archived'].archivedAt?.getTime(),
      archivedAt.getTime()
    )
    assert.ok(!('https://en.wikipedia.org/wiki/Deleted' in map))
  })

  it('excludes hard-deleted Wikipedia items', async () => {
    const item = await prisma.readingItem.create({
      data: {
        title: 'Hard deleted',
        content: '',
        sourceType: 'WIKIPEDIA',
        articleUrl: 'https://en.wikipedia.org/wiki/HardDeleted',
      },
    })
    await deleteItem(prisma, item.id)
    const map = await getImportedWikipediaUrls(prisma)
    assert.ok(!('https://en.wikipedia.org/wiki/HardDeleted' in map))
  })

  it('prefers active item over archived duplicate for the same articleUrl', async () => {
    const url = 'https://en.wikipedia.org/wiki/Duplicate'
    await prisma.readingItem.create({
      data: {
        title: 'Archived section',
        content: '',
        sourceType: 'WIKIPEDIA',
        articleUrl: url,
        archivedAt: new Date(),
        createdAt: new Date('2026-01-02T00:00:00.000Z'),
      },
    })
    const active = await prisma.readingItem.create({
      data: {
        title: 'Active section',
        content: '',
        sourceType: 'WIKIPEDIA',
        articleUrl: url,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    })
    const map = await getImportedWikipediaUrls(prisma)
    assert.equal(map[url].id, active.id)
    assert.equal(map[url].archivedAt, null)
  })

  it('prefers newest createdAt among duplicate active items for the same articleUrl', async () => {
    const url = 'https://en.wikipedia.org/wiki/MultiActive'
    await prisma.readingItem.create({
      data: {
        title: 'Older section',
        content: '',
        sourceType: 'WIKIPEDIA',
        articleUrl: url,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    })
    const newer = await prisma.readingItem.create({
      data: {
        title: 'Newer section',
        content: '',
        sourceType: 'WIKIPEDIA',
        articleUrl: url,
        createdAt: new Date('2026-01-03T00:00:00.000Z'),
      },
    })
    const map = await getImportedWikipediaUrls(prisma)
    assert.equal(map[url].id, newer.id)
    assert.equal(map[url].archivedAt, null)
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

describe('mergeWikipediaSections', () => {
  it('keeps Introduction as lead without a heading', () => {
    const merged = mergeWikipediaSections(
      [
        { sectionTitle: 'Introduction', content: 'Lead text.', articleUrl: 'https://en.wikipedia.org/wiki/X' },
        { sectionTitle: 'Structure', content: 'Body text.', articleUrl: 'https://en.wikipedia.org/wiki/X' },
      ],
      'Article',
      'https://en.wikipedia.org/wiki/X'
    )
    assert.equal(merged.title, 'Article')
    assert.equal(merged.articleUrl, 'https://en.wikipedia.org/wiki/X')
    assert.equal(merged.content, 'Lead text.\n\n## Structure\n\nBody text.')
  })

  it('prefixes non-introduction sections with markdown headings', () => {
    const merged = mergeWikipediaSections(
      [{ sectionTitle: 'History', content: 'Past events.', articleUrl: 'https://en.wikipedia.org/wiki/Y' }],
      'Y',
      'https://en.wikipedia.org/wiki/Y'
    )
    assert.equal(merged.content, '## History\n\nPast events.')
  })
})

describe('fetchWikipediaForReading', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('returns a single merged article object', async () => {
    global.fetch = async () =>
      new Response(JSON.stringify(mockWikipediaParseResponse), { status: 200 })

    const result = await fetchWikipediaForReading('Mitochondrion')
    assert.equal(result.title, 'Mitochondrion')
    assert.ok(typeof result.content === 'string')
    assert.ok(result.content.includes('## Structure'))
    assert.equal(result.articleUrl, 'https://en.wikipedia.org/wiki/Mitochondrion')
  })

  it('returns merged content from mobile-sections fixture via URL', async () => {
    global.fetch = async () =>
      new Response(JSON.stringify(mockWikipediaResponse), { status: 200 })

    const target = resolveWikipediaFetchTarget({
      url: 'https://en.wikipedia.org/wiki/Mitochondria',
    })
    const result = await fetchWikipediaForReading(target)
    assert.equal(result.title, 'Mitochondria')
    assert.ok(result.content.includes('mitochondrion'))
    assert.ok(result.content.includes('## Structure'))
    assert.equal(result.articleUrl, 'https://en.wikipedia.org/wiki/Mitochondria')
  })

  it('accepts a plain article title', async () => {
    global.fetch = async () =>
      new Response(JSON.stringify(mockWikipediaResponse), { status: 200 })

    const result = await fetchWikipediaForReading('Mitochondria')
    assert.ok(result.content.includes('mitochondrion'))
    assert.equal(result.articleUrl, 'https://en.wikipedia.org/wiki/Mitochondria')
  })

  it('canonicalizes articleUrl from URL with fragment', async () => {
    global.fetch = async () =>
      new Response(JSON.stringify(mockWikipediaResponse), { status: 200 })

    const result = await fetchWikipediaForReading(
      'https://en.wikipedia.org/wiki/Mitochondria#Structure'
    )
    assert.equal(result.articleUrl, 'https://en.wikipedia.org/wiki/Mitochondria')
    assert.ok(!result.articleUrl.includes('#'))
  })

  it('canonicalizes articleUrl from URL with query string', async () => {
    global.fetch = async () =>
      new Response(JSON.stringify(mockWikipediaResponse), { status: 200 })

    const result = await fetchWikipediaForReading(
      'https://en.wikipedia.org/wiki/Mitochondria?oldid=12345'
    )
    assert.equal(result.articleUrl, 'https://en.wikipedia.org/wiki/Mitochondria')
    assert.ok(!result.articleUrl.includes('?'))
  })

  it('absolutizes Wikipedia-relative links', async () => {
    global.fetch = async () =>
      new Response(JSON.stringify(mockWikipediaParseResponse), { status: 200 })

    const result = await fetchWikipediaForReading('Mitochondrion')
    assert.ok(result.content.includes('https://en.wikipedia.org/wiki/Organelle'))
    assert.ok(result.content.includes('https://en.wikipedia.org/wiki/Cell'))
    assert.ok(!result.content.includes('](/wiki/'))
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
  it('creates one ReadingItem with sourceType WIKIPEDIA and articleUrl set', async () => {
    const articleUrl = 'https://en.wikipedia.org/wiki/Mitochondria'
    const item = await addWikipediaToQueue(prisma, {
      title: 'Mitochondria',
      content: '## Introduction\n\nLead paragraph.\n\n## Structure\n\nInner membrane.',
      articleUrl,
    })

    assert.equal(item.sourceType, 'WIKIPEDIA')
    assert.equal(item.articleUrl, articleUrl)
    assert.equal(item.url, articleUrl)
    assert.equal(item.title, 'Mitochondria')
    assert.ok(item.content.includes('Introduction'))
    assert.ok(item.content.includes('Structure'))

    const count = await prisma.readingItem.count({ where: { sourceType: 'WIKIPEDIA' } })
    assert.equal(count, 1)
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

type HiddenPassageRange = { start: number; end: number }

describe('hidePassage', () => {
  it('appends passage range to hiddenPassages JSON array', async () => {
    const item = await prisma.readingItem.create({
      data: { title: 'Article', content: 'The sky is blue. The grass is green.', sourceType: 'URL' },
    })
    const updated = await hidePassage(prisma, item.id, 0, 16)
    const passages = JSON.parse(updated.hiddenPassages) as HiddenPassageRange[]
    assert.deepEqual(passages, [{ start: 0, end: 16 }])
    const raw = await prisma.readingItem.findUniqueOrThrow({ where: { id: item.id } })
    assert.deepEqual(JSON.parse(raw.hiddenPassages) as HiddenPassageRange[], [{ start: 0, end: 16 }])
  })

  it('accumulates multiple hidden passage ranges', async () => {
    const item = await prisma.readingItem.create({
      data: { title: 'Article', content: 'A. B. C.', sourceType: 'URL' },
    })
    await hidePassage(prisma, item.id, 0, 2)
    const updated = await hidePassage(prisma, item.id, 3, 5)
    const passages = JSON.parse(updated.hiddenPassages) as HiddenPassageRange[]
    assert.deepEqual(passages, [
      { start: 0, end: 2 },
      { start: 3, end: 5 },
    ])
  })

  it('rejects soft-deleted items without mutating hiddenPassages', async () => {
    const item = await prisma.readingItem.create({
      data: {
        title: 'Deleted',
        content: 'body',
        sourceType: 'URL',
        hiddenPassages: '[{"start":0,"end":4}]',
        deletedAt: new Date(),
      },
    })
    await assert.rejects(() => hidePassage(prisma, item.id, 10, 13), assertNotFoundTrpcError)
    const raw = await prisma.readingItem.findUniqueOrThrow({ where: { id: item.id } })
    assert.equal(raw.hiddenPassages, '[{"start":0,"end":4}]')
  })

  it('rejects malformed hiddenPassages without mutating', async () => {
    for (const hiddenPassages of [
      'not json',
      '{"x":1}',
      '[1]',
      '["legacy string"]',
      '[{"start":0}]',
      '[{"start":"0","end":1}]',
    ]) {
      const item = await prisma.readingItem.create({
        data: { title: 'Bad', content: '', sourceType: 'URL', hiddenPassages },
      })
      await assert.rejects(() => hidePassage(prisma, item.id, 0, 1), /hiddenPassages/i)
      const raw = await prisma.readingItem.findUniqueOrThrow({ where: { id: item.id } })
      assert.equal(raw.hiddenPassages, hiddenPassages)
    }
  })
})

describe('restorePassage', () => {
  it('removes the matching start/end range from hiddenPassages', async () => {
    const item = await prisma.readingItem.create({
      data: {
        title: 'Article',
        content: 'A. B.',
        sourceType: 'URL',
        hiddenPassages: '[{"start":0,"end":2},{"start":3,"end":5}]',
      },
    })
    const updated = await restorePassage(prisma, item.id, 0, 2)
    const passages = JSON.parse(updated.hiddenPassages) as HiddenPassageRange[]
    assert.deepEqual(passages, [{ start: 3, end: 5 }])
  })

  it('removes only the first matching start/end pair when duplicates exist', async () => {
    const item = await prisma.readingItem.create({
      data: {
        title: 'Article',
        content: 'dup',
        sourceType: 'URL',
        hiddenPassages:
          '[{"start":0,"end":3},{"start":4,"end":9},{"start":0,"end":3}]',
      },
    })
    const updated = await restorePassage(prisma, item.id, 0, 3)
    assert.deepEqual(JSON.parse(updated.hiddenPassages) as HiddenPassageRange[], [
      { start: 4, end: 9 },
      { start: 0, end: 3 },
    ])
  })

  it('returns unchanged item when range is not in hiddenPassages', async () => {
    const item = await prisma.readingItem.create({
      data: {
        title: 'Article',
        content: 'A.',
        sourceType: 'URL',
        hiddenPassages: '[{"start":0,"end":2}]',
      },
    })
    const updated = await restorePassage(prisma, item.id, 5, 10)
    assert.deepEqual(JSON.parse(updated.hiddenPassages) as HiddenPassageRange[], [{ start: 0, end: 2 }])
    assert.equal(updated.id, item.id)
  })

  it('does not remove a range when only start or end matches', async () => {
    const item = await prisma.readingItem.create({
      data: {
        title: 'Article',
        content: 'text',
        sourceType: 'URL',
        hiddenPassages: '[{"start":0,"end":5}]',
      },
    })
    const updated = await restorePassage(prisma, item.id, 0, 99)
    assert.deepEqual(JSON.parse(updated.hiddenPassages) as HiddenPassageRange[], [{ start: 0, end: 5 }])
    assert.equal(updated.id, item.id)
  })

  it('rejects soft-deleted items without mutating hiddenPassages', async () => {
    const item = await prisma.readingItem.create({
      data: {
        title: 'Deleted',
        content: 'body',
        sourceType: 'URL',
        hiddenPassages: '[{"start":0,"end":2},{"start":3,"end":5}]',
        deletedAt: new Date(),
      },
    })
    await assert.rejects(() => restorePassage(prisma, item.id, 0, 2), assertNotFoundTrpcError)
    const raw = await prisma.readingItem.findUniqueOrThrow({ where: { id: item.id } })
    assert.equal(raw.hiddenPassages, '[{"start":0,"end":2},{"start":3,"end":5}]')
  })

  it('rejects malformed hiddenPassages without mutating', async () => {
    for (const hiddenPassages of [
      'not json',
      '{"x":1}',
      '[1]',
      '["legacy string"]',
      '[{"start":0}]',
    ]) {
      const item = await prisma.readingItem.create({
        data: { title: 'Bad', content: '', sourceType: 'URL', hiddenPassages },
      })
      await assert.rejects(() => restorePassage(prisma, item.id, 0, 1), /hiddenPassages/i)
      const raw = await prisma.readingItem.findUniqueOrThrow({ where: { id: item.id } })
      assert.equal(raw.hiddenPassages, hiddenPassages)
    }
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
