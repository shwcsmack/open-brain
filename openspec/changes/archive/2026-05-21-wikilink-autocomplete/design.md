## Context

The editor is Tiptap v3 (React). The existing `WikilinkExtension` uses an `InputRule` that fires only when a complete `[[Title]]` pattern is detected — there is no live autocomplete. A `note.list` tRPC procedure already returns all notes (id, title, slug, tags). A `note.searchTitles` procedure exists but only does a simple `contains` query on title and would require a network round-trip per keystroke.

## Goals / Non-Goals

**Goals:**
- Show a ranked autocomplete dropdown when the user types `[[` + at least one character
- Search across note titles and tags
- Support ↑/↓ keyboard navigation and Enter to confirm, Escape to dismiss
- Keep the existing InputRule fallback so manually typed `[[Title]]` still resolves

**Non-Goals:**
- Server-side search — the full note list is small enough to search in-memory
- Searching note body content (title + tags only)
- Modifying `note.searchTitles` or adding new tRPC endpoints

## Decisions

### 1. Custom `onUpdate`-driven detection instead of `@tiptap/suggestion`

**Decision:** Detect the `[[` trigger by scanning text before the cursor in the editor's `onUpdate` callback inside `NoteEditor`, rather than using `@tiptap/suggestion` registered in `WikilinkExtension`.

**Rationale:** `@tiptap/suggestion` uses a single-character trigger; `[[` is two characters. Hacking around this with a regex `findSuggestionMatch` override (the approach noted in Risks) proved fragile in practice. The custom approach — a regex scan in `getActiveWikilinkSuggestion()` plus a document-level `keydown` listener — is simpler, has no extra dependency, and is fully self-contained in `NoteEditor.tsx`. The `InputRule` fallback in `WikilinkExtension` is kept unchanged so manually typed `[[Title]]` still resolves.

**Alternative considered:** `@tiptap/suggestion` with `findSuggestionMatch` override — rejected because the two-character `[[` trigger doesn't fit the plugin's single-char model cleanly (flagged as a risk in the original design).

### 2. Client-side search with Fuse.js

**Decision:** Load the full note list once via `note.list` (already called in the sidebar), pass it into the editor, and search in-memory using [Fuse.js](https://fusejs.io/).

**Rationale:** The dataset is small (typically hundreds of notes). Fuse.js implements the Bitap algorithm, supports multi-field search (title + tags array), and returns ranked results with scores — giving better UX than simple `contains`. A server round-trip per keystroke would add latency and complexity for no gain.

**Search config:**
```ts
new Fuse(notes, {
  keys: [
    { name: 'title', weight: 0.8 },
    { name: 'tags', weight: 0.2 },
  ],
  threshold: 0.4,   // 0 = exact match, 1 = match anything
  includeScore: true,
  minMatchCharLength: 1,
})
```

**Alternative considered:** Simple `startsWith` / `includes` ranking — rejected because it misses typos and mid-word matches that fuzzy search handles well.

### 3. Dropdown rendered as a React portal from `NoteEditor`

**Decision:** `NoteEditor` owns a `WikilinkAutocomplete` React component rendered into a portal. Detection state is driven by `refreshWikilinkSuggestion()` called from the editor's `onUpdate` callback. Position is derived from `editor.view.coordsAtPos()` at the cursor.

**Rationale:** Avoids `tippy.js` as an extra dependency. A React portal lets us use Tailwind/design-system styles consistently with the rest of the app. `coordsAtPos()` provides sufficient cursor coordinates for absolute positioning without any additional plugin.

**Alternative considered:** `tippy.js` (the default in Tiptap docs) — unnecessary dependency given we control the UI layer.

### 4. Notes passed as a prop into `NoteEditor`

**Decision:** Add a `notes` prop (`{ id: string; title: string; tags: string }[]`) to `NoteEditor`. The parent page fetches them via `note.list` (already fetched for the sidebar) and passes them down.

**Rationale:** Avoids a second `note.list` call inside the editor. The notes list does not need to be reactive during an editing session — stale-while-revalidate is acceptable.

## Risks / Trade-offs

- **Stale note list during editing** — if the user creates a new note in another tab, it won't appear in autocomplete until the page reloads. Acceptable for v1; can be improved later with a tRPC subscription or periodic re-fetch.
- **Fuse.js bundle size** (~9 KB minified+gzipped) — minor, well within acceptable range.
- **Suggestion plugin trigger conflicts** — resolved by dropping `@tiptap/suggestion` entirely in favour of the custom `onUpdate`-driven detection described in Decision #1. No plugin trigger configuration needed.

## Open Questions

- _(none — design is sufficient to proceed to implementation)_
