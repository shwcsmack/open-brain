# Brainstorm: hidden-passage-position-ranges

## Background

The reading session page lets users highlight text and click "Delete Passage" to hide that
portion of a reading item. The hidden passage is stored as a JSON array of strings in
`hiddenPassages` on the `ReadingItem` model. When rendering, `markHiddenPassages` searches
the raw markdown string for each stored string and replaces matches with tombstone links.

Two bugs were discovered during manual testing:

**Bug 1 – Markdown token mismatch (silent failure)**
The DOM selection returns plain text (e.g. "The mitochondrion is"). The raw markdown may be
`**The mitochondrion** is`. The stored string is built from `window.getSelection().toString()`,
but `markHiddenPassages` searches the raw markdown. Inline formatting tokens (`**`, `_`, `[]()`)
between or around words cause the regex to find no match, so the passage is never visually
hidden — even though the server returns 200 and the text is persisted.

**Bug 2 – All instances hidden**
The text "United States of America" appears multiple times in an article. Deleting one instance
stores the string `"United States of America"`, and `markHiddenPassages` replaces every
occurrence in the markdown. No notion of "which instance" is stored.

## Root Cause

Both bugs share the same root cause: **text-based identity has no concept of location**.

```
Current model:
  hiddenPassages = ["United States of America"]
  → matches ALL occurrences
  → fails when markdown tokens interrupt the match
```

## Decision

Store **plain-text character offsets** instead of (or alongside) the matched string.

```
Proposed model:
  hiddenPassages = [{ start: 120, end: 144 }]
  → matches EXACTLY the selected range
  → no regex required; works regardless of markdown formatting
```

### Why plain-text offsets, not markdown string offsets?

- DOM selections live in plain text space (what the user sees). Computing them requires
  only DOM tree walking — no markdown parsing.
- Computing markdown string offsets from a DOM selection would require inverting
  ReactMarkdown's transform, which is complex and fragile.
- Plain-text offsets + remark AST walking gives us the markdown position at render time.

### Why not text + occurrence index?

- Text + occurrence index (`{ text, n }`) would solve Bug 2 but not Bug 1.
- It still requires regex matching in raw markdown, so markdown token mismatches remain.
- Two separate fixes for what is fundamentally one structural problem.

### Why not strip markdown for display?

- Loses all formatting (bold, headings, links) in Wikipedia/URL content. Poor UX.

## Design

### Storage format

```ts
// New element type
interface HiddenPassage {
  start: number  // inclusive, plain-text char offset in rendered content
  end: number    // exclusive, plain-text char offset in rendered content
}

// hiddenPassages field: JSON.stringify(HiddenPassage[])
```

### Selection side (SelectionToolbar)

Replace `sel.toString()` with DOM-walking offset computation:

```
walkTextNodes(container) → accumulate char counts
→ find startContainer offset → absolute start
→ find endContainer offset   → absolute end
```

Pass `{ start, end }` (and optionally `text` for display) to `onDeletePassage`.

### Render side (ExtractHighlighter)

Replace regex-based `markHiddenPassages`:

1. Use remark to parse markdown into an AST (remark AST nodes carry `position` fields —
   source offsets into the raw markdown string).
2. Walk AST text nodes, accumulating plain-text characters to build:
   `plainTextOffset → markdownOffset` mapping.
3. For each `{ start, end }` range, find the corresponding markdown source range.
4. Sort ranges descending, splice tombstone markers into the markdown string.

This is structurally similar to the current approach but replaces regex search with
exact AST-position lookup.

### Migration

`hiddenPassages` format changes from `string[]` to `HiddenPassage[]`. Existing dev
database data will be cleared (app not yet deployed; no production data exists).

Clear command: `UPDATE "ReadingItem" SET "hiddenPassages" = '[]'`

### Server

`reading.hidePassage` router input changes from `{ id, text }` to `{ id, start, end }`.
`readingQueue.hidePassage` stores the `{ start, end }` object instead of a string.
`readingQueue.restorePassage` (if it exists) identifies passages by `{ start, end }`.

### Restore flow

Restoring a passage currently matches by text string. With position storage, restore
identifies the passage by its `{ start, end }` pair (exact match removal from the array).

## Open questions resolved

- **Content updates**: If `content` changes after passages are hidden, stored offsets
  will point to wrong locations (graceful degradation — tombstone won't appear, but no
  crash). Acceptable given that reading item content is effectively immutable after creation.

- **Duplicate identical ranges**: If the same range is submitted twice, `prev.includes`
  check in `handleDeletePassage` would need to compare objects not references. Use
  `start`/`end` equality check instead.
