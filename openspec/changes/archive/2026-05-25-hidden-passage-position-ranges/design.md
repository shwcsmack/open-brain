# Design: hidden-passage-position-ranges

## Context

The reading session allows users to select text and click "Delete passage" to soft-hide it.
Hidden passages are stored as a JSON array of strings (`hiddenPassages` on `ReadingItem`).
At render time, `markHiddenPassages` builds a regex from each stored string and searches the
raw markdown for a match.

Two bugs exist in the current implementation:

1. **All-instances bug**: storing text with no location means every occurrence of that text in
   the markdown is replaced by a tombstone. Selecting "United States of America" hides it
   everywhere.

2. **Markdown-token mismatch**: DOM selection returns plain text (the visible text). The raw
   markdown may have formatting tokens (`**`, `_`, `[text](url)`) that interrupt regex matching.
   Selecting "The mitochondrion is" fails to match `**The mitochondrion** is` — the `**` after
   "mitochondrion" breaks the `\s+` pattern. The server returns 200 and saves the string, but
   the tombstone never appears.

Both bugs share the same root cause: text-based identity has no concept of location.

## Goals / Non-Goals

**Goals:**
- Hide exactly the selected occurrence of a passage, not all occurrences
- Make passage hiding reliable regardless of inline markdown formatting
- Keep the restore flow working after the schema change
- Clear existing `hiddenPassages` data in the dev database (no production data exists)

**Non-Goals:**
- Handling content edits that invalidate stored offsets (content is effectively immutable)
- Supporting passage hiding outside the reading session (article detail page has no toolbar)
- Changing the tombstone UI or restore UX

## Decisions

### D1: Store plain-text character offsets instead of text strings

- **Choice**: `hiddenPassages` stores `Array<{ start: number, end: number }>` where `start`
  and `end` are character offsets into the **plain-text rendering** of the item's markdown
  content (what the user sees, not the raw markdown string).
- **Rationale**: Plain-text offsets uniquely identify a location in the document, eliminating
  both bugs simultaneously. The offset is computed from the DOM selection — the coordinate
  space the user is working in — so no inverse transformation is needed at write time.
- **Alternatives considered**:
  - *Text + occurrence index `{ text, n }`*: Solves Bug 1 but not Bug 2; still requires regex
    matching in raw markdown, which fails on formatting tokens.
  - *Markdown string offsets*: Eliminates regex matching at render time, but requires inverting
    ReactMarkdown's transform to compute offsets from a DOM selection — complex and fragile.
  - *Fix the regex (allow markdown tokens between words)*: Partial fix; can't handle links
    (`[text](url)` where the URL is between selected words) and is brittle.

### D2: Compute offsets via DOM tree walking at selection time

- **Choice**: In `SelectionToolbar`, replace `sel.toString()` for passage deletion with a DOM
  walker that accumulates only text contributing to the markdown plain-text coordinate space.
  UI-only text (Wikipedia import pill chrome, screen-reader suffixes) is ignored, and tombstone
  placeholders count as the length of the original hidden range they replaced. The delete click
  handler recomputes offsets from the live `Range` before calling `onDeletePassage(start, end)`.
- **Rationale**: The DOM selection's `Range` object gives precise node-level positions. Walking
  text nodes within the rendered article is straightforward for inline formatting, but the
  rendered article also contains UI chrome that is not part of the markdown source. Explicit DOM
  annotations keep the selection coordinate system aligned with `buildPlainTextMap(markdown)`,
  including after one or more tombstones are already visible.
- **Alternatives considered**:
  - *`Range.getBoundingClientRect` + character counting*: Approximate, not byte-accurate.
  - *Custom rehype plugin injecting position markers*: More complex, requires touching the
    render pipeline.

### D3: Map plain-text offsets back to markdown positions using the remark AST

- **Choice**: At render time in `ExtractHighlighter`, parse the markdown with `remark` +
  `remarkGfm` to get an AST. Walk the AST's `text` nodes (which carry `position` fields —
  source offsets into the raw markdown). Build a cumulative plain-text-offset →
  markdown-offset mapping. For each `{ start, end }` range, find the matching markdown source
  range and splice in a tombstone marker.
- **Rationale**: The remark AST explicitly records where each text node sits in the source
  markdown. This makes the forward mapping (markdown → plain text) trivially accurate.
  Reversing it (plain text offset → markdown offset) requires only a linear scan of the
  accumulated text lengths.
- **Alternatives considered**:
  - *Custom markdown stripper*: Would need to correctly handle all markdown syntax to produce
    accurate offsets. Essentially reimplements a markdown parser.
  - *Keep regex, extend separator*: Cannot handle links with inline URLs, brittle for edge
    cases.

### D4: Restore identifies passages by `{ start, end }` pair

- **Choice**: `reading.restorePassage` accepts `{ id, start, end }` and removes the entry
  matching both fields from the `hiddenPassages` array.
- **Rationale**: Since passages are no longer identified by text, the restore call must use
  the same coordinate system. Start+end uniquely identifies an entry (two passages at the
  exact same offsets cannot coexist meaningfully).
- **Alternatives considered**:
  - *Restore by index in array*: Fragile (indices shift when other passages are restored
    concurrently). Start+end is stable.

### D5: Tombstone restore data carries `{ start, end }` in the restore map

- **Choice**: `markHiddenPassages` returns a `restoreMap` keyed by group ID, where each
  value is `Array<{ start: number, end: number }>` (previously `string[]`). The tombstone
  `onRestore` callback passes these objects to `handleRestorePassages`.
- **Rationale**: The restore call needs the same coordinates used to identify the passage.
  Carrying them through the restore map is the minimal change to the existing flow.

## Risks / Trade-offs

- **[Trade-off] Offset stability**: If a reading item's `content` is ever updated after
  passages are hidden, stored offsets will silently point to wrong locations (tombstones may
  not appear, or appear at wrong positions). Acceptable because reading item content is
  effectively immutable after creation. Graceful degradation — no crash, just a missed tombstone.

- **[Risk] remark AST text node coverage**: The remark AST's text nodes cover literal text;
  some constructs (e.g. autolinks, HTML blocks) may produce content outside `text` nodes. If
  a user selects text that spans a non-`text` AST node, the offset mapping may be incomplete.
  Mitigation: test with Wikipedia content; fall back to showing nothing for unmatched ranges
  (same behavior as current regex failure).

- **[Trade-off] Duplicate range check**: The current `prev.includes(text)` check compares by
  reference for objects. Must change to compare `start`/`end` values. Minor, but must be done.

- **[Risk] `restoreMap` shape change breaks tombstone restore**: The `PassageTombstone`
  component currently receives `string[]` from `restoreMap`. Changing to
  `{ start, end }[]` is a type-safe breaking change — caught at compile time.

## Migration Plan

Dev database only (app not deployed):

```sql
UPDATE "ReadingItem" SET "hiddenPassages" = '[]';
```

Run once against the local dev database before deploying the code change. No rollback needed
(data is dev-only). The new code will write `[{"start":N,"end":M}]` format going forward.

## Open Questions

None — all major decisions resolved during brainstorming.
