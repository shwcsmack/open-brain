## 1. Fix delete passage whitespace matching

- [x] 1.1 In `markHiddenPassages` in `ExtractHighlighter.tsx`, after building `escapedText`, replace literal spaces with `\s+` in the regex pattern string so cross-paragraph selections match
- [x] 1.2 Verify the fix: a stored passage `"end of one. start of two."` should now match markdown `"end of one.\n\nstart of two."` via the updated regex

## 2. Fix selection highlight over Wikipedia link pills

- [x] 2.1 Add `select-text` Tailwind class (compiles to `user-select: text`) to the `<button>` element in `WikipediaLinkWithPill` in `ExtractHighlighter.tsx`
- [x] 2.2 Add `select-text` to the inner `<span className="underline">{children}</span>` in `WikipediaLinkWithPill` so the display text is also selectable

## 3. Exclude File: Wikipedia URLs from import pill

- [x] 3.1 Add helper `isWikipediaFileUrl(href: string): boolean` in `ExtractHighlighter.tsx` — returns true when the URL is a Wikipedia URL and its wiki path segment starts with `File:` (case-insensitive)
- [x] 3.2 In the `a` component renderer inside `ExtractHighlighter`, add a guard: if `isWikipediaFileUrl(href)` is true, skip `WikipediaLinkWithPill` and fall through to the plain `<a>` renderer
