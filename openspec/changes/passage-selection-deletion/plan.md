# Passage Selection & Deletion Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three bugs in `ExtractHighlighter.tsx`: make cross-paragraph passage deletion work, make selection highlight visible through Wikipedia link pills, and exclude File: Wikipedia URLs from the import pill.

**Architecture:** All changes are in a single file — `open-brain/components/reading/ExtractHighlighter.tsx`. The two pure functions (`markHiddenPassages`, `isWikipediaFileUrl`) are exported so they can be unit-tested with Jest. The `WikipediaLinkWithPill` button gets a CSS tweak.

**Tech Stack:** React, TypeScript, Tailwind CSS, Jest (ts-jest, Node environment)

---

## Task 1: Fix cross-paragraph whitespace matching in `markHiddenPassages`

**Files:**
- Modify: `open-brain/components/reading/ExtractHighlighter.tsx` (lines 139–206, the `markHiddenPassages` function)
- Test: `open-brain/tests/extractHighlighter.test.ts` (create)

The bug: `markHiddenPassages` normalizes the stored passage text to single spaces (`text.replace(/\s+/g, ' ')`), then builds a literal regex from that. The regex `"para one para two"` never matches raw markdown `"para one\n\npara two"`. Fix: replace spaces in the regex pattern with `\s+`.

- [ ] **Step 1: Export `markHiddenPassages` for testing**

  In `ExtractHighlighter.tsx`, change the function signature from:
  ```tsx
  function markHiddenPassages(
    markdown: string,
    passages: string[]
  ): { md: string; restoreMap: Record<string, string[]> } {
  ```
  To:
  ```tsx
  export function markHiddenPassages(
    markdown: string,
    passages: string[]
  ): { md: string; restoreMap: Record<string, string[]> } {
  ```

- [ ] **Step 2: Write the failing test**

  Create `open-brain/tests/extractHighlighter.test.ts`:

  ```typescript
  import { markHiddenPassages } from '../components/reading/ExtractHighlighter'

  describe('markHiddenPassages', () => {
    it('hides a single-paragraph passage', () => {
      const md = 'Hello world.'
      const { md: result } = markHiddenPassages(md, ['Hello world.'])
      expect(result).not.toContain('Hello world.')
      expect(result).toContain('1 passage hidden')
    })

    it('hides a cross-paragraph passage', () => {
      const md = 'End of one.\n\nStart of two.'
      // Browser collapses \n\n to a space in sel.toString()
      const { md: result } = markHiddenPassages(md, ['End of one. Start of two.'])
      expect(result).not.toContain('End of one.')
      expect(result).not.toContain('Start of two.')
      expect(result).toContain('1 passage hidden')
    })

    it('returns unchanged markdown when no passage matches', () => {
      const md = 'Some content here.'
      const { md: result } = markHiddenPassages(md, ['not present'])
      expect(result).toBe(md)
    })

    it('hides multiple independent passages', () => {
      const md = 'First. Middle. Last.'
      const { md: result } = markHiddenPassages(md, ['First.', 'Last.'])
      expect(result).not.toContain('First.')
      expect(result).not.toContain('Last.')
    })
  })
  ```

- [ ] **Step 3: Run the test to confirm it fails**

  ```bash
  cd open-brain && npx jest tests/extractHighlighter.test.ts --no-coverage
  ```

  Expected: the cross-paragraph test fails because `"End of one. Start of two."` doesn't match `"End of one.\n\nStart of two."` with the current literal regex.

- [ ] **Step 4: Apply the whitespace fix**

  In `markHiddenPassages`, find this block (around line 154–161):

  ```tsx
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (!normalized) continue
  const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(escaped, 'gi')
  ```

  Replace with:

  ```tsx
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (!normalized) continue
  const escapedText = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regexStr = escapedText.replace(/ /g, '\\s+')
  const re = new RegExp(regexStr, 'gi')
  ```

- [ ] **Step 5: Run the test to confirm it passes**

  ```bash
  cd open-brain && npx jest tests/extractHighlighter.test.ts --no-coverage
  ```

  Expected: all 4 tests pass.

- [ ] **Step 6: Run the full test suite to confirm no regressions**

  ```bash
  cd open-brain && npx jest --no-coverage
  ```

  Expected: all tests pass.

---

## Task 2: Make selection highlight visible through Wikipedia link pills

**Files:**
- Modify: `open-brain/components/reading/ExtractHighlighter.tsx` (`WikipediaLinkWithPill` component, around line 208–239)

The bug: `WikipediaLinkWithPill` renders as a `<button>`. Browsers apply `user-select: none` to buttons by default, which means drag-selections that cross the button don't show a visual highlight over the pill text. Fix: add Tailwind's `select-text` class (`user-select: text`) to the button and its text span.

- [ ] **Step 1: Update `WikipediaLinkWithPill` className**

  Find the `WikipediaLinkWithPill` component's return statement. The `<button>` currently has:
  ```tsx
  className={`not-prose inline-flex min-h-6 min-w-6 cursor-pointer items-center gap-1 rounded-sm border border-transparent bg-transparent p-0 text-primary underline ${FOCUS_RING}`}
  ```

  Change to (add `select-text`):
  ```tsx
  className={`not-prose inline-flex min-h-6 min-w-6 cursor-pointer items-center gap-1 rounded-sm border border-transparent bg-transparent p-0 text-primary underline select-text ${FOCUS_RING}`}
  ```

- [ ] **Step 2: Update the inner text span**

  Find the `<span className="underline">{children}</span>` inside `WikipediaLinkWithPill` and add `select-text`:
  ```tsx
  <span className="underline select-text">{children}</span>
  ```

- [ ] **Step 3: Verify TypeScript compiles**

  ```bash
  cd open-brain && npx tsc --noEmit
  ```

  Expected: no errors.

---

## Task 3: Exclude File: Wikipedia URLs from the import pill

**Files:**
- Modify: `open-brain/components/reading/ExtractHighlighter.tsx` (add `isWikipediaFileUrl` helper; update `a` component renderer)
- Test: `open-brain/tests/extractHighlighter.test.ts` (extend)

Wikipedia `File:` URLs like `https://en.wikipedia.org/wiki/File:Foo.svg` are image/media pages, not readable articles. They should render as plain `<a>` tags, not as `WikipediaLinkWithPill`.

- [ ] **Step 1: Export `isWikipediaFileUrl` helper**

  Add the following function in `ExtractHighlighter.tsx`, near the other helper functions at the top of the file (after `isWikipediaUrl`):

  ```tsx
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
  ```

- [ ] **Step 2: Write tests for `isWikipediaFileUrl`**

  Add to `open-brain/tests/extractHighlighter.test.ts`:

  ```typescript
  import { markHiddenPassages, isWikipediaFileUrl } from '../components/reading/ExtractHighlighter'

  // ... existing markHiddenPassages tests ...

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

- [ ] **Step 3: Run the new tests to confirm they pass**

  ```bash
  cd open-brain && npx jest tests/extractHighlighter.test.ts --no-coverage
  ```

  Expected: all tests pass (the function is already implemented).

- [ ] **Step 4: Add the guard in the `a` component renderer**

  In `ExtractHighlighter`, find the `a` component inside the `ReactMarkdown` `components` prop. Currently:

  ```tsx
  const wiki = href && isWikipediaUrl(href)
  if (wiki && onAddWikipediaLink && href) {
  ```

  Change to:

  ```tsx
  const wiki = href && isWikipediaUrl(href) && !isWikipediaFileUrl(href)
  if (wiki && onAddWikipediaLink && href) {
  ```

- [ ] **Step 5: Verify TypeScript compiles**

  ```bash
  cd open-brain && npx tsc --noEmit
  ```

  Expected: no errors.

- [ ] **Step 6: Run the full test suite**

  ```bash
  cd open-brain && npx jest --no-coverage
  ```

  Expected: all tests pass.

- [ ] **Step 7: Smoke test in the browser**

  Start the dev server:
  ```bash
  cd open-brain && npm run dev
  ```

  Open a reading session that contains a Wikipedia article with image links (e.g. any article with figures). Verify:
  1. `File:` links render as plain underlined text, not as `+` or `✓` pill buttons
  2. Regular Wikipedia article links still show the pill
  3. Selecting text that spans a Wikipedia link pill shows a continuous selection highlight
  4. Selecting text across multiple paragraphs and clicking "Delete passage" actually hides the passage
