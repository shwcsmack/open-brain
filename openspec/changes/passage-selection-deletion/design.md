## Context

The reading session page renders article content through `ExtractHighlighter`, which uses `ReactMarkdown` with custom renderers. Users can select text and click "Delete passage" via `SelectionToolbar`. Two bugs exist: the selection highlight is suppressed over Wikipedia link pill buttons (because `<button>` has `user-select: none`), and deleted passages are never actually hidden because the whitespace regex matching fails across paragraph breaks.

A third issue: Wikipedia `File:` URLs (e.g. `https://en.wikipedia.org/wiki/File:Foo.svg`) are incorrectly rendered as importable article pills — they are media/image pages, not readable articles.

All fixes live in `open-brain/components/reading/ExtractHighlighter.tsx`.

## Goals / Non-Goals

**Goals:**
- Fix `markHiddenPassages` to match across paragraph breaks using `\s+` in the regex
- Make selection highlight visible through `WikipediaLinkWithPill` by allowing text selection on the button
- Exclude `File:` Wikipedia URLs from the import pill — render them as plain links

**Non-Goals:**
- Fixing deletion of image selections (no text in `sel.toString()`)
- Fixing deletion of selections containing wikilink markdown syntax (e.g. `[[Link]]`)
- Backend / schema changes

## Decisions

### D1: Whitespace-flexible regex in `markHiddenPassages`
- **Choice:** Replace spaces in the escaped regex pattern with `\s+` so `"para one para two"` matches `"para one\n\npara two"` in raw markdown
- **Reason:** The browser's `sel.toString()` collapses multi-paragraph selections to single spaces; the raw markdown has `\n\n`; the current regex fails to match
- **Considered alternative:** Preprocess markdown with `preprocessWikilinks` before matching — rejected as it risks broken markdown around inline link syntax

### D2: `user-select: text` on `WikipediaLinkWithPill`
- **Choice:** Add `select-text` Tailwind class to the `<button>` and inner `<span>` elements
- **Reason:** `<button>` defaults to `user-select: none` in browsers, which suppresses the selection highlight when a drag-selection passes over it
- **Considered alternative:** Convert button to `<span role="button">` — rejected as it removes native button semantics/keyboard behavior

### D3: Exclude `File:` Wikipedia URLs from the import pill
- **Choice:** Add `isWikipediaFileUrl(href: string): boolean` helper — returns true when the URL path segment after `/wiki/` starts with `File:` (case-insensitive prefix match). In the `a` component renderer, check this before the existing `isWikipediaUrl` guard.
- **Reason:** File: pages are media/image pages, not readable articles; adding them to the reading queue makes no sense
- **Considered alternative:** Block the whole `wikipedia.org/wiki/File:` namespace client-side in `handleAddWikipediaLink` — rejected as cleaner to fix at the render layer where the pill is created

## Risks / Trade-offs

[Trade-off] `\s+` regex is more permissive — a stored passage "foo bar" could match "foo\n\n> bar" inside a blockquote → Accepted: false matches are unlikely in real articles; a missed hide is worse UX than an overly-eager hide

[Risk] `user-select: text` on a button allows text to be dragged out of the pill button — Low risk; the pill button is small and the user-select change is scoped to text selection, not drag behavior

## Migration Plan

N/A — frontend-only, no DB or API changes.

## Open Questions

None.
