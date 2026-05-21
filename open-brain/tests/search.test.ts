/**
 * Integration test for searchNotes helper.
 *
 * This test exercises the pure serialization helpers that searchNotes relies on
 * without requiring a live database connection. For database-backed FTS tests,
 * see the prisma seed + manual smoke test in README.md.
 */

// Mock the prisma module to avoid requiring a live DB in unit tests
jest.mock('@/lib/prisma', () => ({
  prisma: {
    $queryRawUnsafe: jest.fn().mockRejectedValue(new Error('no fts')),
    note: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  },
}))

import { searchNotes } from '@/lib/search'

describe('searchNotes', () => {
  it('returns empty array when no notes match', async () => {
    const results = await searchNotes('nonexistent-xyz-12345')
    expect(Array.isArray(results)).toBe(true)
    expect(results).toHaveLength(0)
  })

  it('falls back gracefully when FTS tables do not exist', async () => {
    // prisma.$queryRawUnsafe is mocked to throw, so it should fall back to findMany
    const { prisma } = require('@/lib/prisma')
    ;(prisma.note.findMany as jest.Mock).mockResolvedValueOnce([
      {
        id: 'test-id',
        title: 'Test Note',
        slug: 'test-note',
        updatedAt: new Date(),
        body: JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello world' }] }] }),
      },
    ])
    const results = await searchNotes('hello')
    expect(results).toHaveLength(1)
    expect(results[0].title).toBe('Test Note')
    expect(results[0].type).toBe('note')
  })
})
