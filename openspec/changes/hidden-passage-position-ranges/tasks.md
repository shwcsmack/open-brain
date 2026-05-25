## 1. Database migration

- [ ] 1.1 Clear all `hiddenPassages` data in the dev database: `UPDATE "ReadingItem" SET "hiddenPassages" = '[]'`

## 2. Server — update API inputs and storage

- [ ] 2.1 Update `hidePassage` in `lib/readingQueue.ts` to accept `{ start: number, end: number }` and append that object to the `hiddenPassages` JSON array instead of a string
- [ ] 2.2 Update `restorePassage` in `lib/readingQueue.ts` to accept `{ start: number, end: number }` and remove the matching entry by `start`/`end` equality
- [ ] 2.3 Update `reading.hidePassage` tRPC input schema in `server/routers/reading.ts` from `{ id, text }` to `{ id, start, end }`
- [ ] 2.4 Update `reading.restorePassage` tRPC input schema in `server/routers/reading.ts` from `{ id, text }` to `{ id, start, end }`
- [ ] 2.5 Update `parseHiddenPassagesJson` in `lib/readingQueue.ts` to parse and return `Array<{ start: number, end: number }>` instead of `string[]`

## 3. SelectionToolbar — emit offsets instead of text

- [ ] 3.1 Add a `getPlainTextOffset(container: Element, node: Node, offset: number): number` helper that walks text nodes to compute an absolute character offset
- [ ] 3.2 Update `SelectionToolbar` props: change `onDeletePassage: (text: string) => void` to `onDeletePassage: (start: number, end: number) => void`
- [ ] 3.3 In the "Delete passage" click handler, use `window.getSelection().getRangeAt(0)` with the helper to compute `start` and `end`, then call `onDeletePassage(start, end)` instead of passing `selectedText`

## 4. ExtractHighlighter — replace regex matching with AST offset mapping

- [ ] 4.1 Add `remark` and `remark-gfm` (already a peer dep) imports; write a `buildPlainTextMap(markdown: string): { plainText: string, offsets: number[] }` function that parses the markdown AST and walks `text`-type nodes to build a mapping from each plain-text character index to its source markdown position
- [ ] 4.2 Rewrite `markHiddenPassages` to accept `passages: Array<{ start: number, end: number }>`, use `buildPlainTextMap` to resolve each range to markdown source positions, and splice tombstone markers at those positions (descending order, same as current approach)
- [ ] 4.3 Update the `restoreMap` value type from `string[]` to `Array<{ start: number, end: number }>` throughout `ExtractHighlighter`
- [ ] 4.4 Update `ExtractHighlighter` props: change `hiddenPassages?: string[]` to `hiddenPassages?: Array<{ start: number, end: number }>`
- [ ] 4.5 Update the `useMemo` dependency array and destructuring to use the new types

## 5. Session page — wire up new types end-to-end

- [ ] 5.1 Update `parseHiddenPassagesJson` in `app/reading/session/page.tsx` to return `Array<{ start: number, end: number }>` and update `localHiddenPassages` state type accordingly
- [ ] 5.2 Update `handleDeletePassage` signature to `(start: number, end: number)` and update the optimistic state update and mutation call to use `{ start, end }` objects; fix the duplicate-check to compare by value not reference
- [ ] 5.3 Update `handleRestorePassages` to accept and forward `Array<{ start: number, end: number }>` to the restore mutation
- [ ] 5.4 Update `rollbackHiddenPassagesIfCurrent` and related state snapshot logic to use the new type

## 6. Tests

- [ ] 6.1 Update existing `markHiddenPassages` tests in `tests/extractHighlighter.test.ts` to pass `{ start, end }` objects instead of strings
- [ ] 6.2 Add tests for `buildPlainTextMap` covering: plain text, bold (`**...**`), italic (`_..._`), and link (`[text](url)`) content
- [ ] 6.3 Add tests for `markHiddenPassages` covering: formatted content (bold/italic around selection boundary), repeated text (only one instance hidden), and cross-paragraph ranges
- [ ] 6.4 Update `hidePassage` and `restorePassage` tests in `tests/reading.test.ts` to use `{ start, end }` inputs
- [ ] 6.5 Add a `getPlainTextOffset` unit test covering selections within and across multiple DOM text nodes
