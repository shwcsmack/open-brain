## 1. Database migration

- [x] 1.1 Clear all `hiddenPassages` data in the dev database: `UPDATE "ReadingItem" SET "hiddenPassages" = '[]'`

## 2. Server — update API inputs and storage

- [x] 2.1 Update `hidePassage` in `lib/readingQueue.ts` to accept `{ start: number, end: number }` and append that object to the `hiddenPassages` JSON array instead of a string
- [x] 2.2 Update `restorePassage` in `lib/readingQueue.ts` to accept `{ start: number, end: number }` and remove the matching entry by `start`/`end` equality
- [x] 2.3 Update `reading.hidePassage` tRPC input schema in `server/routers/reading.ts` from `{ id, text }` to `{ id, start, end }`
- [x] 2.4 Update `reading.restorePassage` tRPC input schema in `server/routers/reading.ts` from `{ id, text }` to `{ id, start, end }`
- [x] 2.5 Update `parseHiddenPassagesJson` in `lib/readingQueue.ts` to parse and return `Array<{ start: number, end: number }>` instead of `string[]`

## 3. SelectionToolbar — emit offsets instead of text

- [x] 3.1 Add a `getPlainTextOffset(container: Element, node: Node, offset: number): number` helper that walks text nodes to compute an absolute character offset
- [x] 3.2 Update `SelectionToolbar` props: change `onDeletePassage: (text: string) => void` to `onDeletePassage: (start: number, end: number) => void`
- [x] 3.3 In the "Delete passage" click handler, use `window.getSelection().getRangeAt(0)` with the helper to compute `start` and `end`, then call `onDeletePassage(start, end)` instead of passing `selectedText`

## 4. ExtractHighlighter — replace regex matching with AST offset mapping

- [x] 4.1 Add `remark` and `remark-gfm` (already a peer dep) imports; write a `buildPlainTextMap(markdown: string): { plainText: string, offsets: number[] }` function that parses the markdown AST and walks `text`-type nodes to build a mapping from each plain-text character index to its source markdown position
- [x] 4.2 Rewrite `markHiddenPassages` to accept `passages: Array<{ start: number, end: number }>`, use `buildPlainTextMap` to resolve each range to markdown source positions, and splice tombstone markers at those positions (descending order, same as current approach)
- [x] 4.3 Update the `restoreMap` value type from `string[]` to `Array<{ start: number, end: number }>` throughout `ExtractHighlighter`
- [x] 4.4 Update `ExtractHighlighter` props: change `hiddenPassages?: string[]` to `hiddenPassages?: Array<{ start: number, end: number }>`
- [x] 4.5 Update the `useMemo` dependency array and destructuring to use the new types

## 5. Session page — wire up new types end-to-end

- [x] 5.1 Update `parseHiddenPassagesJson` in `app/reading/session/page.tsx` to return `Array<{ start: number, end: number }>` and update `localHiddenPassages` state type accordingly
- [x] 5.2 Update `handleDeletePassage` signature to `(start: number, end: number)` and update the optimistic state update and mutation call to use `{ start, end }` objects; fix the duplicate-check to compare by value not reference
- [x] 5.3 Update `handleRestorePassages` to accept and forward `Array<{ start: number, end: number }>` to the restore mutation
- [x] 5.4 Update `rollbackHiddenPassagesIfCurrent` and related state snapshot logic to use the new type
- [x] 5.5 Update `app/reading/[id]/page.tsx` restore state and mutation calls to use `Array<{ start: number, end: number }>` so detail-page tombstone restore compiles and works

## 6. Tests

- [x] 6.1 Update existing `markHiddenPassages` tests in `tests/extractHighlighter.test.ts` to pass `{ start, end }` objects instead of strings
- [x] 6.2 Add tests for `buildPlainTextMap` covering: plain text, bold (`**...**`), italic (`_..._`), and link (`[text](url)`) content
- [x] 6.3 Add tests for `markHiddenPassages` covering: formatted content (bold/italic around selection boundary), repeated text (only one instance hidden), and cross-paragraph ranges
- [x] 6.4 Update `hidePassage` and `restorePassage` tests in `tests/reading.test.ts` to use `{ start, end }` inputs
- [x] 6.5 Add a `getPlainTextOffset` unit test covering selections within and across multiple DOM text nodes

## 7. Manual verification

- [x] 7.1 Verify in the browser that repeated text hides only the selected occurrence, formatted text hides without markdown marker leaks, wikilinks and Wikipedia link pills do not shift offsets, and session/detail restore round-trips to `hiddenPassages = []`
