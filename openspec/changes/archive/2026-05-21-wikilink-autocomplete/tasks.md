## 1. Install Dependencies

- [x] 1.1 Add `@tiptap/suggestion` and `fuse.js` to `open-brain/package.json` and install

## 2. WikilinkExtension — Suggestion Plugin

- [x] 2.1 Import `Suggestion` from `@tiptap/suggestion` in `WikilinkExtension.ts`
- [x] 2.2 Add a `suggestion` option to the extension (typed as `Partial<SuggestionOptions>`) so `NoteEditor` can inject callbacks via `.configure({ suggestion: { ... } })`
- [x] 2.3 Register the Suggestion plugin in `addProseMirrorPlugins()` using the merged suggestion config with `char: '['` and a `findSuggestionMatch` override that requires `[[` (two brackets) to trigger
- [x] 2.4 Keep the existing `InputRule` as a fallback for users who type a complete `[[Title]]` without using the dropdown

## 3. WikilinkAutocomplete Component

- [x] 3.1 Create `open-brain/components/editor/WikilinkAutocomplete.tsx` — a dropdown list that accepts `items` (notes), `selectedIndex`, `onSelect` callback, and a `rect` for positioning
- [x] 3.2 Render each item showing the note title and tags (tags displayed as small chips or comma-separated text)
- [x] 3.3 Highlight the item at `selectedIndex`
- [x] 3.4 Show an empty-state message when `items` is empty
- [x] 3.5 Render the dropdown via a React portal anchored to `document.body`, positioned using the `rect` coordinates

## 4. Wire Autocomplete into NoteEditor

- [x] 4.1 Add a `notes` prop to `NoteEditor` (`{ id: string; title: string; tags: string }[]`) and update its `Props` interface
- [x] 4.2 Initialise a `Fuse` instance (memoised) from the `notes` prop, configured to search `title` (weight 0.8) and parsed `tags` array (weight 0.2) with threshold 0.4
- [x] 4.3 Add state for `suggestionState` (`{ rect: DOMRect; items: Note[]; selectedIndex: number } | null`) to drive the dropdown
- [x] 4.4 Configure `WikilinkExtension` with suggestion callbacks — `onStart`/`onUpdate` run the Fuse query and set `suggestionState`; `onExit` clears it
- [x] 4.5 Implement `onKeyDown` in the suggestion config to handle ↑/↓ (move `selectedIndex`), Enter (select current item and insert a resolved wikilink node), and Escape (clear state while preserving the typed text)
- [x] 4.6 Render `<WikilinkAutocomplete>` when `suggestionState` is non-null, passing items, selectedIndex, rect, and an `onSelect` handler that inserts the resolved wikilink node

## 5. Pass Notes from Page to Editor

- [x] 5.1 In `open-brain/app/notes/[slug]/page.tsx`, fetch the note list (via `trpc.note.list` or equivalent server-side call) and pass it as the `notes` prop to `NoteEditor`

## 6. Verification

- [x] 6.1 Manually verify: typing `[[` + one character opens the dropdown showing title and tags
- [x] 6.2 Manually verify: ↑/↓ moves highlight, Enter inserts a resolved wikilink chip, dropdown closes
- [x] 6.3 Manually verify: Escape dismisses the dropdown without inserting a node
- [x] 6.4 Manually verify: typing a query with no matches shows the empty state
- [x] 6.5 Manually verify: clicking a dropdown item inserts the resolved wikilink
- [x] 6.6 Manually verify: typing a full `[[Title]]` without using the dropdown still resolves via the InputRule fallback
