## Why

Two bugs make passage deletion in the reading session non-functional. First, deleting a passage that spans multiple paragraphs silently fails because the stored text (with collapsed whitespace from `sel.toString()`) never matches the raw markdown (which has double newlines between paragraphs). Second, the browser suppresses selection highlighting over Wikipedia link pill buttons, making it unclear what text the user has actually selected. A bonus fix: Wikipedia `File:` URLs are incorrectly offered as importable articles — they are image/media pages.

## What Changes

**Passage deletion regex matching**
- From: `markHiddenPassages` builds a literal regex from the normalized passage text and matches it against raw markdown — fails for cross-paragraph selections
- To: Spaces in the regex pattern are replaced with `\s+`, allowing any whitespace sequence (including `\n\n`) to match where the selection had a space
- Reason: Fixes the most common delete-passage failure case
- Impact: Non-breaking; passages that already matched still match; new `\s+` patterns match strictly more content

**Selection highlight over wikilink pills**
- From: `WikipediaLinkWithPill` renders as a `<button>` which inherits `user-select: none`, suppressing the selection highlight
- To: Button and its child spans get `select-text` (user-select: text) so the browser draws the selection highlight through the pill
- Reason: Users couldn't tell whether their selection included wikilink text
- Impact: Non-breaking cosmetic change

**`File:` Wikipedia URLs excluded from import pill**
- From: All `en.wikipedia.org/wiki/*` links render as `WikipediaLinkWithPill`, including media/image pages like `File:Foo.svg`
- To: URLs whose wiki path starts with `File:` fall through to plain `<a>` rendering
- Reason: File: pages are not readable articles; the import pill makes no sense for them
- Impact: Non-breaking; plain link is always available

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `reading-passage-deletion`: Deletion matching now handles cross-paragraph whitespace
- `reading-article-detail`: Wikipedia link pill rendering excludes File: namespace

## Impact

- **Affected file:** `open-brain/components/reading/ExtractHighlighter.tsx`
- **No backend changes**
- **No database changes**
- **No new dependencies**
