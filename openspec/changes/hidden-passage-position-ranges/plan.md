# Hidden Passage Position Ranges — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace text-based hidden passage storage with plain-text character offset pairs so that exactly the selected occurrence is hidden, regardless of inline markdown formatting.

**Architecture:** `SelectionToolbar` computes `{ start, end }` plain-text offsets by walking the DOM's text nodes. These offsets are stored in `hiddenPassages` (JSON array of `{start,end}` objects). At render time, `ExtractHighlighter` uses the `unified` / `remark-parse` AST to build a plain-text → markdown-source offset map and resolves each stored range to an exact markdown position for tombstone splicing.

**Tech Stack:** TypeScript, tRPC (Zod input schemas), Prisma (SQLite), React, `unified` + `remark-parse` + `remark-gfm` + `unist-util-visit` (all already installed), Jest + `tsx --test` for testing.

---

## File Map

| File | Change |
|------|--------|
| `lib/readingQueue.ts` | Rewrite `parseHiddenPassagesJson`, `hidePassage`, `restorePassage` |
| `server/routers/reading.ts` | Update `hidePassage` and `restorePassage` input schemas |
| `components/reading/SelectionToolbar.tsx` | Add DOM offset helper; change `onDeletePassage` prop |
| `components/reading/ExtractHighlighter.tsx` | Add `buildPlainTextMap`; rewrite `markHiddenPassages`; update props/types |
| `app/reading/session/page.tsx` | Update `parseHiddenPassagesJson`, state type, handlers |
| `tests/reading.test.ts` | Update + add `hidePassage` / `restorePassage` tests |
| `tests/extractHighlighter.test.ts` | Update + add `buildPlainTextMap` / `markHiddenPassages` tests |

---

## Task 1: Database migration

**Files:**
- No file changes — one-time SQL command against `prisma/dev.db`

- [ ] **Step 1: Clear existing hiddenPassages data**

```bash
cd open-brain
npx prisma db execute --stdin <<'EOF'
UPDATE "ReadingItem" SET "hiddenPassages" = '[]';
EOF
```

Expected output: `Script executed successfully.`

- [ ] **Step 2: Verify the data is cleared**

```bash
npx prisma db execute --stdin <<'EOF'
SELECT COUNT(*) as items_with_data FROM "ReadingItem" WHERE "hiddenPassages" != '[]';
EOF
```

Expected output: `items_with_data = 0`

---

## Task 2: Update server — `lib/readingQueue.ts`

**Files:**
- Modify: `open-brain/lib/readingQueue.ts`
- Test: `open-brain/tests/reading.test.ts`

**Before writing code, understand the shape:**
- `hidePassage(db, id, text: string)` → becomes `hidePassage(db, id, start: number, end: number)`
- `restorePassage(db, id, text: string)` → becomes `restorePassage(db, id, start: number, end: number)`
- `parseHiddenPassagesJson` validates an array of `{start, end}` objects instead of strings

- [ ] **Step 1: Write failing tests for the new server functions**

In `open-brain/tests/reading.test.ts`, find the `describe('hidePassage', ...)` block (around line 967) and replace it, then find `describe('restorePassage', ...)` (around line 1016) and replace it:

```ts
describe('hidePassage', () => {
  it('appends { start, end } to hiddenPassages JSON array', async () => {
    const item = await prisma.readingItem.create({
      data: { title: 'Article', content: 'The sky is blue.', sourceType: 'URL' },
    })
    const updated = await hidePassage(prisma, item.id, 0, 16)
    const passages = JSON.parse(updated.hiddenPassages) as unknown[]
    assert.deepEqual(passages, [{ start: 0, end: 16 }])
    const raw = await prisma.readingItem.findUniqueOrThrow({ where: { id: item.id } })
    assert.deepEqual(JSON.parse(raw.hiddenPassages), [{ start: 0, end: 16 }])
  })

  it('accumulates multiple hidden passages', async () => {
    const item = await prisma.readingItem.create({
      data: { title: 'Article', content: 'A. B. C.', sourceType: 'URL' },
    })
    await hidePassage(prisma, item.id, 0, 2)
    const updated = await hidePassage(prisma, item.id, 3, 5)
    const passages = JSON.parse(updated.hiddenPassages) as unknown[]
    assert.deepEqual(passages, [{ start: 0, end: 2 }, { start: 3, end: 5 }])
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
    await assert.rejects(() => hidePassage(prisma, item.id, 5, 9), assertNotFoundTrpcError)
    const raw = await prisma.readingItem.findUniqueOrThrow({ where: { id: item.id } })
    assert.equal(raw.hiddenPassages, '[{"start":0,"end":4}]')
  })

  it('rejects malformed hiddenPassages without mutating', async () => {
    for (const hiddenPassages of ['not json', '{"x":1}', '[1]', '["string"]']) {
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
  it('removes the matching { start, end } entry from hiddenPassages', async () => {
    const item = await prisma.readingItem.create({
      data: {
        title: 'Article',
        content: 'A. B.',
        sourceType: 'URL',
        hiddenPassages: '[{"start":0,"end":2},{"start":3,"end":5}]',
      },
    })
    const updated = await restorePassage(prisma, item.id, 0, 2)
    assert.deepEqual(JSON.parse(updated.hiddenPassages), [{ start: 3, end: 5 }])
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
    const updated = await restorePassage(prisma, item.id, 99, 100)
    assert.deepEqual(JSON.parse(updated.hiddenPassages), [{ start: 0, end: 2 }])
    assert.equal(updated.id, item.id)
  })

  it('rejects soft-deleted items without mutating hiddenPassages', async () => {
    const item = await prisma.readingItem.create({
      data: {
        title: 'Deleted',
        content: 'body',
        sourceType: 'URL',
        hiddenPassages: '[{"start":0,"end":2}]',
        deletedAt: new Date(),
      },
    })
    await assert.rejects(() => restorePassage(prisma, item.id, 0, 2), assertNotFoundTrpcError)
    const raw = await prisma.readingItem.findUniqueOrThrow({ where: { id: item.id } })
    assert.equal(raw.hiddenPassages, '[{"start":0,"end":2}]')
  })

  it('rejects malformed hiddenPassages without mutating', async () => {
    for (const hiddenPassages of ['not json', '{"x":1}', '[1]', '["string"]']) {
      const item = await prisma.readingItem.create({
        data: { title: 'Bad', content: '', sourceType: 'URL', hiddenPassages },
      })
      await assert.rejects(() => restorePassage(prisma, item.id, 0, 1), /hiddenPassages/i)
      const raw = await prisma.readingItem.findUniqueOrThrow({ where: { id: item.id } })
      assert.equal(raw.hiddenPassages, hiddenPassages)
    }
  })
})
```

Also find the cross-reference test around line 332–341 (`hidePassage rejects missing id`) and update its call signature:
```ts
it('hidePassage rejects missing id', async () => {
  await assert.rejects(
    () => hidePassage(prisma, missingReadingItemId, 0, 5),
    assertNotFoundTrpcError
  )
})
```

And the `restorePassage rejects missing id` test:
```ts
it('restorePassage rejects missing id', async () => {
  await assert.rejects(
    () => restorePassage(prisma, missingReadingItemId, 0, 5),
    assertNotFoundTrpcError
  )
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd open-brain && npm run test:reading 2>&1 | grep -E "FAIL|Error|hidePassage|restorePassage" | head -20
```

Expected: failures referencing wrong argument count or type errors.

- [ ] **Step 3: Implement the new `parseHiddenPassagesJson`, `hidePassage`, `restorePassage` in `lib/readingQueue.ts`**

Replace the `parseHiddenPassagesJson` function (lines 114–131) and `hidePassage` / `restorePassage` functions (lines 133–149) with:

```ts
export interface HiddenPassage {
  start: number
  end: number
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
  if (
    !Array.isArray(parsed) ||
    !parsed.every(
      (entry): entry is HiddenPassage =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as Record<string, unknown>).start === 'number' &&
        typeof (entry as Record<string, unknown>).end === 'number'
    )
  ) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'hiddenPassages must be a JSON array of {start, end} objects',
    })
  }
  return parsed
}

export async function hidePassage(db: PrismaClient, id: string, start: number, end: number) {
  const item = await requireActiveReadingItem(db, id)
  const current = parseHiddenPassagesJson(item.hiddenPassages)
  return db.readingItem.update({
    where: { id },
    data: { hiddenPassages: JSON.stringify([...current, { start, end }]) },
  })
}

export async function restorePassage(db: PrismaClient, id: string, start: number, end: number) {
  const item = await requireActiveReadingItem(db, id)
  const current = parseHiddenPassagesJson(item.hiddenPassages)
  const idx = current.findIndex(p => p.start === start && p.end === end)
  if (idx === -1) return item
  const next = [...current.slice(0, idx), ...current.slice(idx + 1)]
  return db.readingItem.update({ where: { id }, data: { hiddenPassages: JSON.stringify(next) } })
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd open-brain && npm run test:reading 2>&1 | grep -E "hidePassage|restorePassage|pass|fail" | tail -20
```

Expected: all `hidePassage` and `restorePassage` tests pass.

- [ ] **Step 5: Commit**

```bash
git add open-brain/lib/readingQueue.ts open-brain/tests/reading.test.ts
git commit -m "refactor(reading): store hidden passages as {start,end} offsets in readingQueue"
```

---

## Task 3: Update tRPC router — `server/routers/reading.ts`

**Files:**
- Modify: `open-brain/server/routers/reading.ts`

- [ ] **Step 1: Update `hidePassage` and `restorePassage` input schemas**

In `open-brain/server/routers/reading.ts`, replace lines 157–163:

```ts
  hidePassage: protectedProcedure
    .input(z.object({ id: z.string(), start: z.number().int().nonnegative(), end: z.number().int().positive() }))
    .mutation(({ input }) => hidePassage(prisma, input.id, input.start, input.end)),

  restorePassage: protectedProcedure
    .input(z.object({ id: z.string(), start: z.number().int().nonnegative(), end: z.number().int().positive() }))
    .mutation(({ input }) => restorePassage(prisma, input.id, input.start, input.end)),
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd open-brain && npx tsc --noEmit 2>&1 | grep -E "reading|hidePassage|restorePassage" | head -20
```

Expected: no errors in these files. (Other unrelated pre-existing errors are OK at this stage.)

- [ ] **Step 3: Commit**

```bash
git add open-brain/server/routers/reading.ts
git commit -m "refactor(reading): update hidePassage/restorePassage tRPC schemas to use {id, start, end}"
```

---

## Task 4: Rewrite `ExtractHighlighter` — AST-based offset mapping

**Files:**
- Modify: `open-brain/components/reading/ExtractHighlighter.tsx`
- Test: `open-brain/tests/extractHighlighter.test.ts`

**Concept:** `buildPlainTextMap(markdown)` parses the markdown with `remark`, walks `text` AST nodes (which have `position.start.offset` — their byte offset in the source string), and accumulates characters to produce `{ plainText, offsets }` where `offsets[i]` is the markdown source position for `plainText[i]`. Then `markHiddenPassages` uses this map to splice tombstones at the exact markdown source positions corresponding to `{start, end}` plain-text ranges.

- [ ] **Step 1: Write failing tests for `buildPlainTextMap` and the new `markHiddenPassages`**

Replace the full contents of `open-brain/tests/extractHighlighter.test.ts`:

```ts
jest.mock('react-markdown', () => ({ __esModule: true, default: () => null }))
jest.mock('remark-gfm', () => ({ __esModule: true, default: () => {} }))

import {
  isWikipediaFileUrl,
  markHiddenPassages,
  buildPlainTextMap,
} from '../components/reading/ExtractHighlighter'

describe('buildPlainTextMap', () => {
  it('maps plain text positions to markdown positions for plain text', () => {
    const { plainText, offsets } = buildPlainTextMap('Hello world.')
    expect(plainText).toBe('Hello world.')
    expect(offsets[0]).toBe(0)   // 'H' is at markdown pos 0
    expect(offsets[6]).toBe(6)   // 'w' is at markdown pos 6
    expect(offsets[11]).toBe(11) // '.' is at markdown pos 11
  })

  it('skips bold markers (**) from offsets', () => {
    // "**bold**" → plain text is "bold", markdown positions are 2,3,4,5
    const { plainText, offsets } = buildPlainTextMap('**bold**')
    expect(plainText).toBe('bold')
    expect(offsets[0]).toBe(2) // 'b' at markdown pos 2 (after **)
    expect(offsets[3]).toBe(5) // 'd' at markdown pos 5
  })

  it('skips italic markers (_) from offsets', () => {
    // "_italic_" → plain text is "italic", markdown positions 1–6
    const { plainText, offsets } = buildPlainTextMap('_italic_')
    expect(plainText).toBe('italic')
    expect(offsets[0]).toBe(1)
    expect(offsets[5]).toBe(6)
  })

  it('skips link syntax and URL from offsets', () => {
    // "[text](url)" → plain text is "text"
    const { plainText, offsets } = buildPlainTextMap('[text](https://example.com)')
    expect(plainText).toBe('text')
    expect(offsets[0]).toBe(1) // 't' at markdown pos 1 (after '[')
    expect(offsets[3]).toBe(4) // 't' at markdown pos 4
  })

  it('handles plain text before and after bold', () => {
    const { plainText, offsets } = buildPlainTextMap('The **cell** is')
    expect(plainText).toBe('The cell is')
    expect(offsets[0]).toBe(0)  // 'T'
    expect(offsets[4]).toBe(6)  // 'c' (after "The **")
    expect(offsets[8]).toBe(13) // 'i' (after "The **cell** ")
  })
})

describe('markHiddenPassages', () => {
  it('hides a single passage by plain-text offset', () => {
    // "Hello world." — hide "Hello" (0–5)
    const { md: result } = markHiddenPassages('Hello world.', [{ start: 0, end: 5 }])
    expect(result).not.toContain('Hello')
    expect(result).toContain('1 passage hidden')
    expect(result).toContain('world.')
  })

  it('hides only the correct occurrence when text repeats', () => {
    // "yes no yes" — plain text offsets for first "yes": 0–3, second: 7–10
    const md = 'yes no yes'
    const { md: result } = markHiddenPassages(md, [{ start: 0, end: 3 }])
    expect(result).not.toMatch(/^yes/)
    expect(result).toContain('yes') // second occurrence still present
    expect(result).toContain('1 passage hidden')
  })

  it('hides a passage from bold-formatted content', () => {
    // "**The cell** is here" — plain text: "The cell is here"
    // hiding "The cell" (plain text 0–8)
    const md = '**The cell** is here'
    const { md: result } = markHiddenPassages(md, [{ start: 0, end: 8 }])
    expect(result).not.toContain('The cell')
    expect(result).toContain('1 passage hidden')
    expect(result).toContain('is here')
  })

  it('returns unchanged markdown when range has no matching content', () => {
    const md = 'Some content here.'
    const { md: result } = markHiddenPassages(md, [{ start: 999, end: 1010 }])
    expect(result).toBe(md)
  })

  it('hides multiple passages', () => {
    const md = 'First. Middle. Last.'
    // plain text = "First. Middle. Last."
    // "First." = 0–6, "Last." = 15–20
    const { md: result } = markHiddenPassages(md, [{ start: 0, end: 6 }, { start: 15, end: 20 }])
    expect(result).not.toContain('First.')
    expect(result).not.toContain('Last.')
    expect(result).toContain('Middle.')
  })

  it('restoreMap contains the { start, end } pairs for each group', () => {
    const md = 'Hello world.'
    const { restoreMap } = markHiddenPassages(md, [{ start: 0, end: 5 }])
    const groups = Object.values(restoreMap)
    expect(groups).toHaveLength(1)
    expect(groups[0]).toEqual([{ start: 0, end: 5 }])
  })
})

describe('isWikipediaFileUrl', () => {
  it('returns true for File: namespace URLs', () => {
    expect(isWikipediaFileUrl('https://en.wikipedia.org/wiki/File:Foo.svg')).toBe(true)
    expect(isWikipediaFileUrl('https://en.wikipedia.org/wiki/file:Bar.png')).toBe(true)
  })

  it('returns false for regular article URLs', () => {
    expect(isWikipediaFileUrl('https://en.wikipedia.org/wiki/Mitochondria')).toBe(false)
  })

  it('returns false for non-Wikipedia URLs', () => {
    expect(isWikipediaFileUrl('https://example.com/wiki/File:Foo.svg')).toBe(false)
  })

  it('returns false for non-URL strings', () => {
    expect(isWikipediaFileUrl('not-a-url')).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd open-brain && npx jest tests/extractHighlighter.test.ts --no-coverage 2>&1 | tail -20
```

Expected: failures on `buildPlainTextMap` (not exported) and `markHiddenPassages` (wrong signature).

- [ ] **Step 3: Add `HiddenPassage` type and `buildPlainTextMap` to `ExtractHighlighter.tsx`**

At the top of `open-brain/components/reading/ExtractHighlighter.tsx`, after the existing imports, add:

```ts
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import { visit } from 'unist-util-visit'
import type { Root, Text } from 'mdast'
```

Then add the type and function before `markExtracts`:

```ts
export interface HiddenPassage {
  start: number
  end: number
}

export function buildPlainTextMap(markdown: string): {
  plainText: string
  offsets: number[]
} {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(markdown) as Root
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
```

- [ ] **Step 4: Rewrite `markHiddenPassages` to use `buildPlainTextMap`**

Replace the entire `markHiddenPassages` function (from `export function markHiddenPassages` through its closing `}`) with:

```ts
export function markHiddenPassages(
  markdown: string,
  passages: HiddenPassage[]
): { md: string; restoreMap: Record<string, HiddenPassage[]> } {
  if (passages.length === 0) return { md: markdown, restoreMap: {} }

  const { offsets } = buildPlainTextMap(markdown)

  interface MdRange {
    mdStart: number
    mdEnd: number
    passage: HiddenPassage
  }

  const mdRanges: MdRange[] = []
  for (const p of passages) {
    const mdStart = offsets[p.start]
    // p.end is exclusive in plain text; last char is at p.end - 1
    const lastCharMdPos = offsets[p.end - 1]
    if (mdStart === undefined || lastCharMdPos === undefined) continue
    // mdEnd: scan forward in markdown from lastCharMdPos to include the full char
    // (offsets gives the START of each markdown char, so end = lastCharMdPos + 1
    //  unless the markdown has a multi-char sequence ending the node — +1 is correct
    //  for single-byte chars, which covers all plain-text content)
    const mdEnd = lastCharMdPos + 1
    mdRanges.push({ mdStart, mdEnd, passage: p })
  }

  if (mdRanges.length === 0) return { md: markdown, restoreMap: {} }

  // Sort by markdown start position to enable merging adjacent ranges
  mdRanges.sort((a, b) => a.mdStart - b.mdStart)

  // Merge overlapping or adjacent markdown ranges
  const merged: { mdStart: number; mdEnd: number; passages: HiddenPassage[]; key: string }[] = []
  let groupCounter = 0

  for (const r of mdRanges) {
    const last = merged[merged.length - 1]
    if (last && r.mdStart <= last.mdEnd) {
      last.mdEnd = Math.max(last.mdEnd, r.mdEnd)
      last.passages.push(r.passage)
    } else {
      const gap = last ? markdown.slice(last.mdEnd, r.mdStart) : ''
      if (last && /^\s*$/.test(gap)) {
        last.mdEnd = r.mdEnd
        last.passages.push(r.passage)
      } else {
        merged.push({
          mdStart: r.mdStart,
          mdEnd: r.mdEnd,
          passages: [r.passage],
          key: `restore-group-${groupCounter++}`,
        })
      }
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
```

- [ ] **Step 5: Update `Props` interface and component internals in `ExtractHighlighter.tsx`**

In the `Props` interface (around line 20), change:
```ts
// Before:
hiddenPassages?: string[]
onRestorePassage?: (text: string) => void
onRestorePassages?: (texts: string[]) => void

// After:
hiddenPassages?: HiddenPassage[]
onRestorePassage?: (passage: HiddenPassage) => void
onRestorePassages?: (passages: HiddenPassage[]) => void
```

In the `ExtractHighlighter` component function, update the `useMemo` internal type:
```ts
// Before:
let restoreMap: Record<string, string[]> = {}

// After:
let restoreMap: Record<string, HiddenPassage[]> = {}
```

In the `a` render handler, the `texts` variable is now `HiddenPassage[]` — update the onRestore call:
```ts
// Before:
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

// After:
if (passages?.length && (onRestorePassages || onRestorePassage)) {
  return (
    <PassageTombstone
      count={passages.length}
      onRestore={() => {
        if (onRestorePassages) onRestorePassages(passages)
        else if (onRestorePassage) {
          for (const p of passages) onRestorePassage(p)
        }
      }}
    />
  )
}
```

Note: rename `const texts = restoreMap[key]` to `const passages = restoreMap[key]` in the `a` handler.

- [ ] **Step 6: Run tests to verify they pass**

```bash
cd open-brain && npx jest tests/extractHighlighter.test.ts --no-coverage 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add open-brain/components/reading/ExtractHighlighter.tsx open-brain/tests/extractHighlighter.test.ts
git commit -m "refactor(reading): replace regex passage matching with AST-based plain-text offset mapping"
```

---

## Task 5: Update `SelectionToolbar` — emit offsets instead of text

**Files:**
- Modify: `open-brain/components/reading/SelectionToolbar.tsx`

- [ ] **Step 1: Add the `getPlainTextOffset` helper and update `onDeletePassage` prop**

Replace the full contents of `open-brain/components/reading/SelectionToolbar.tsx` with:

```ts
'use client'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'

interface Props {
  contentId: string
  onExtract: (text: string) => void
  onSaveAsNote: (text: string) => void
  onCreateFlashcard: (text: string) => void
  onDeletePassage: (start: number, end: number) => void
}

interface Position {
  top: number
  left: number
}

function getPlainTextOffset(container: Element, targetNode: Node, targetOffset: number): number {
  let count = 0
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
  while (walker.nextNode()) {
    const node = walker.currentNode
    if (node === targetNode) return count + targetOffset
    count += (node.textContent ?? '').length
  }
  return count + targetOffset
}

export function SelectionToolbar({
  contentId,
  onExtract,
  onSaveAsNote,
  onCreateFlashcard,
  onDeletePassage,
}: Props) {
  const [selectedText, setSelectedText] = useState('')
  const [selectionRange, setSelectionRange] = useState<{ start: number; end: number } | null>(null)
  const [position, setPosition] = useState<Position | null>(null)
  const toolbarRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleSelectionChange() {
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed || !sel.toString().trim()) {
        setSelectedText('')
        setSelectionRange(null)
        setPosition(null)
        return
      }

      const contentEl = document.getElementById(contentId)
      if (!contentEl) return
      const range = sel.getRangeAt(0)
      if (!contentEl.contains(range.commonAncestorContainer)) {
        setSelectedText('')
        setSelectionRange(null)
        setPosition(null)
        return
      }

      const start = getPlainTextOffset(contentEl, range.startContainer, range.startOffset)
      const end = getPlainTextOffset(contentEl, range.endContainer, range.endOffset)

      const rect = range.getBoundingClientRect()
      setSelectedText(sel.toString().trim())
      setSelectionRange({ start, end })
      setPosition({
        top: rect.top + window.scrollY - 48,
        left: rect.left + rect.width / 2,
      })
    }

    document.addEventListener('mouseup', handleSelectionChange)
    document.addEventListener('selectionchange', handleSelectionChange)
    return () => {
      document.removeEventListener('mouseup', handleSelectionChange)
      document.removeEventListener('selectionchange', handleSelectionChange)
    }
  }, [contentId])

  function dismissSelection() {
    window.getSelection()?.removeAllRanges()
    setSelectedText('')
    setSelectionRange(null)
    setPosition(null)
  }

  if (!position || !selectedText || !selectionRange) return null

  return (
    <div
      ref={toolbarRef}
      style={{
        position: 'absolute',
        top: position.top,
        left: position.left,
        transform: 'translateX(-50%)',
      }}
      className="z-50 flex gap-1 rounded-lg border bg-popover p-1 shadow-lg"
      onMouseDown={e => e.preventDefault()}
    >
      <Button
        size="sm"
        variant="ghost"
        className="h-7 px-2 text-xs"
        onClick={() => {
          onExtract(selectedText)
          dismissSelection()
        }}
      >
        Extract
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="h-7 px-2 text-xs"
        onClick={() => {
          onSaveAsNote(selectedText)
          dismissSelection()
        }}
      >
        Save as Note
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="h-7 px-2 text-xs"
        onClick={() => {
          onCreateFlashcard(selectedText)
          dismissSelection()
        }}
      >
        Flashcard
      </Button>
      <Button
        size="sm"
        variant="destructive"
        className="h-7 px-2 text-xs"
        aria-label="Delete passage"
        onClick={() => {
          onDeletePassage(selectionRange.start, selectionRange.end)
          dismissSelection()
        }}
      >
        Delete passage
      </Button>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd open-brain && npx tsc --noEmit 2>&1 | grep "SelectionToolbar\|session/page" | head -20
```

Expected: errors in `session/page.tsx` (downstream consumer not yet updated — expected at this stage).

- [ ] **Step 3: Commit**

```bash
git add open-brain/components/reading/SelectionToolbar.tsx
git commit -m "refactor(reading): SelectionToolbar computes plain-text offsets for passage deletion"
```

---

## Task 6: Update session page — `app/reading/session/page.tsx`

**Files:**
- Modify: `open-brain/app/reading/session/page.tsx`

- [ ] **Step 1: Import `HiddenPassage` type and update `parseHiddenPassagesJson`**

Add the import at the top of the file (after existing imports):
```ts
import type { HiddenPassage } from '@/components/reading/ExtractHighlighter'
```

Replace the `parseHiddenPassagesJson` function (lines 50–58):
```ts
function parseHiddenPassagesJson(raw: string | null | undefined): HiddenPassage[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (entry): entry is HiddenPassage =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as Record<string, unknown>).start === 'number' &&
        typeof (entry as Record<string, unknown>).end === 'number'
    )
  } catch {
    return []
  }
}
```

- [ ] **Step 2: Update `localHiddenPassages` state type**

Change line 153:
```ts
// Before:
const [localHiddenPassages, setLocalHiddenPassages] = useState<string[]>([])

// After:
const [localHiddenPassages, setLocalHiddenPassages] = useState<HiddenPassage[]>([])
```

- [ ] **Step 3: Update `rollbackHiddenPassagesIfCurrent`**

Change its `snapshot` parameter type. Find:
```ts
const rollbackHiddenPassagesIfCurrent = useCallback((itemId: string, snapshot: string[]) => {
```
Replace with:
```ts
const rollbackHiddenPassagesIfCurrent = useCallback((itemId: string, snapshot: HiddenPassage[]) => {
```

- [ ] **Step 4: Update `handleDeletePassage`**

Replace the entire `handleDeletePassage` function:
```ts
function handleDeletePassage(start: number, end: number) {
  if (!current) return
  const itemId = current.id
  let previous: HiddenPassage[] = []
  let alreadyHidden = false
  setLocalHiddenPassages(prev => {
    previous = prev
    if (prev.some(p => p.start === start && p.end === end)) {
      alreadyHidden = true
      return prev
    }
    return [...prev, { start, end }]
  })
  if (alreadyHidden) return

  hidePassageMutation.mutate(
    { id: itemId, start, end },
    {
      onError: () => {
        rollbackHiddenPassagesIfCurrent(itemId, previous)
        toast.error('Failed to hide passage')
      },
    }
  )
}
```

- [ ] **Step 5: Update `handleRestorePassages`**

Replace the entire `handleRestorePassages` function:
```ts
async function handleRestorePassages(passages: HiddenPassage[]) {
  if (!current || passages.length === 0) return
  const itemId = current.id
  let previous: HiddenPassage[] = []
  setLocalHiddenPassages(prev => {
    previous = prev
    let next = [...prev]
    for (const p of passages) {
      const idx = next.findIndex(x => x.start === p.start && x.end === p.end)
      if (idx === -1) continue
      next = [...next.slice(0, idx), ...next.slice(idx + 1)]
    }
    return next
  })

  try {
    for (const p of passages) {
      await restorePassageMutation.mutateAsync({ id: itemId, start: p.start, end: p.end })
    }
  } catch {
    rollbackHiddenPassagesIfCurrent(itemId, previous)
    toast.error(
      passages.length === 1 ? 'Failed to restore passage' : 'Failed to restore hidden passages'
    )
  }
}
```

- [ ] **Step 6: Verify TypeScript compiles cleanly**

```bash
cd open-brain && npx tsc --noEmit 2>&1 | grep -v "node_modules" | head -20
```

Expected: no errors.

- [ ] **Step 7: Run the full test suite**

```bash
cd open-brain && npm test 2>&1 | tail -30
```

Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add open-brain/app/reading/session/page.tsx
git commit -m "refactor(reading): update session page to use HiddenPassage offset types end-to-end"
```

---

## Task 7: Verify manually in the browser

- [ ] **Step 1: Start the dev server**

```bash
cd open-brain && npm run dev
```

- [ ] **Step 2: Open a reading session with a Wikipedia article or URL item**

Navigate to `http://localhost:3000/reading/session`.

- [ ] **Step 3: Test basic deletion**

Select a short phrase of plain text → click "Delete passage" → verify a tombstone appears immediately at the correct location.

- [ ] **Step 4: Test formatted text deletion**

Select text that spans or is adjacent to bold text (e.g. "The **mitochondrion** is" renders as "The mitochondrion is") → click "Delete passage" → verify tombstone appears.

- [ ] **Step 5: Test duplicate text deletion**

Find a phrase that appears multiple times → select one occurrence → click "Delete passage" → verify only that occurrence is replaced by a tombstone and others remain.

- [ ] **Step 6: Test restore**

Click "Restore" on a tombstone → verify the text reappears.

- [ ] **Step 7: Test persistence on reload**

Delete a passage → reload the page → verify the tombstone is still present.

- [ ] **Step 8: Commit if any fixes were required, then final commit**

```bash
git add -p  # stage only intentional changes
git commit -m "fix(reading): passage deletion bugs found during manual verification"
```
