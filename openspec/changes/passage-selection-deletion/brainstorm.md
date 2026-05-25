# Brainstorm: Passage Selection Visibility + Deletion Fix

## Background

The reading session page (`app/reading/session/page.tsx`) lets users select text and take actions via `SelectionToolbar` — including "Delete passage" which hides the selected text from the article. Two bugs:

1. **Visual**: The browser's selection highlight doesn't show over `WikipediaLinkWithPill` buttons; blank-line and image selections don't trigger the toolbar.
2. **Functional**: "Delete passage" stores the selected text and tries to regex-match it against the raw markdown on re-render. Cross-paragraph selections fail because `sel.toString()` collapses `\n\n` to a single space, which never matches `\n\n` in the raw markdown source.

## Decision Chain

**Q1: What is the root cause of the delete passage failure?**

`markHiddenPassages` (in `ExtractHighlighter.tsx`) normalizes the stored passage text with `text.replace(/\s+/g, ' ')`, producing a single-space-separated string. It then builds a regex from this normalized text and matches it against the raw markdown (which has `\n\n` paragraph breaks). The regex `"para one para two"` (single space) never matches `"para one\n\npara two"` (double newline). The fix: replace spaces in the regex pattern with `\s+` so any whitespace sequence matches.

**Q2: Why doesn't the selection highlight show over wikilinks?**

`WikipediaLinkWithPill` is a `<button>` element. Browsers apply `user-select: none` to buttons by default, which prevents text inside them from being part of a drag-selection highlight. Fix: add `user-select: text` (Tailwind `select-text`) to the button and its inner `<span>`.

**Q3: Should File: Wikipedia URLs show the import pill?**

No. URLs like `https://en.wikipedia.org/wiki/File:Mitochondria.svg` are image/media pages on Wikipedia, not readable articles. Clicking them makes no sense as a "read this article" action. Fix: add an `isWikipediaFilePage` check in `ExtractHighlighter` — if the URL's wiki path starts with `File:`, skip the `WikipediaLinkWithPill` and fall through to plain `<a>` rendering.

**Q4: What about blank-line and image selections?**

The toolbar relies on `sel.toString().trim()` being non-empty. Blank-line-only selections give `""` and the toolbar doesn't appear. Since there's no text to store or match, there's nothing to delete — this is acceptable behavior. The visual concern (user can't tell blank lines are in their selection) is addressed by fixing the `user-select` issue on buttons, which makes the overall selection highlight more reliable. Blank lines in a selection are visually highlighted by the browser when `user-select` isn't suppressed on surrounding elements.

**Q5: What about image deletion?**

Images produce no text from `sel.toString()`. Deleting images from markdown requires matching `![alt](url)` syntax, which is not part of the scope here. Accepted as a known limitation.

## Chosen Approach: Option A

### Changes

1. **`markHiddenPassages` regex fix** (`ExtractHighlighter.tsx`)  
   After building `escapedText`, replace literal spaces with `\s+` in the regex pattern:
   ```
   const regexStr = escapedText.replace(/ /g, '\\s+')
   const re = new RegExp(regexStr, 'gi')
   ```
   This makes `"para one para two"` match `"para one\n\npara two"` in raw markdown.

2. **`WikipediaLinkWithPill` user-select fix** (`ExtractHighlighter.tsx`)  
   Add `select-text` Tailwind class (or `style="user-select: text"`) to the button element and its child spans so the browser shows the selection highlight through the pill.

3. **File: URL exclusion** (`ExtractHighlighter.tsx`)  
   Add a helper `isWikipediaFileUrl(href)` that returns true for paths starting with `/wiki/File:`. In the `a` component renderer, skip the `WikipediaLinkWithPill` for file URLs and fall through to plain `<a>`.

### Files changed
- `open-brain/components/reading/ExtractHighlighter.tsx` — all three fixes live here

### No backend changes
The `hidePassage` / `restorePassage` mutations and the `hiddenPassages` schema are unchanged.

## Trade-offs Considered

| | Fix | Con |
|---|---|---|
| **Chosen: `\s+` regex** | Fixes most real-world delete failures with 2 lines | Doesn't fix wikilink text mismatch (separate issue) |
| **Preprocess before match** | Also fixes wikilink selections | Risk of broken markdown around inline links |
| **Offset-based storage** | Fully correct | Large rework, needs DOM→markdown mapping |
