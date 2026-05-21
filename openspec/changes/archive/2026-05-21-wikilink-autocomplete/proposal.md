## Why

When a user types `[[` to start a wikilink, there is no autocomplete — they must remember exact note titles or guess, leading to broken/unresolved links and friction in building a connected knowledge base. The wiki-linking spec already declares this requirement but it has never been implemented.

## What Changes

- Typing `[[` followed by one or more characters triggers a floating dropdown anchored to the cursor
- The dropdown shows up to 10 matching notes, each entry showing the note's **title** and its **tags** (if any)
- Matching uses a scored substring/prefix algorithm (e.g. Fuse.js or similar) — fast enough for thousands of notes in-memory
- The user can navigate the dropdown with **↑ / ↓** arrow keys and confirm with **Enter**, or click an item
- **Escape** or typing `]]` without selecting dismisses the dropdown
- Selecting an item inserts a resolved `wikilink` node (with `noteId` and `title`) and closes the dropdown
- If no notes match, the dropdown shows an empty state; the user can still type `]]` to create an unresolved wikilink manually

## Capabilities

### New Capabilities
_(none — this enhances an existing capability)_

### Modified Capabilities
- `wiki-linking`: The existing "Wikilink autocomplete" requirement is under-specified. Requirements are being expanded to cover: search across titles and tags, scored ranking, keyboard navigation, empty state, and dismissal behaviour.

## Impact

- `open-brain/components/editor/extensions/WikilinkExtension.ts` — replace the static InputRule with a Tiptap `Suggestion` plugin that drives the autocomplete lifecycle
- `open-brain/components/editor/NoteEditor.tsx` — render the autocomplete dropdown UI (React portal or inline); wire up the Suggestion plugin callbacks
- New component: `open-brain/components/editor/WikilinkAutocomplete.tsx` — the dropdown list component
- `open-brain/server/routers/note.ts` (or equivalent tRPC router) — may need a lightweight `note.search` procedure if notes are not already available client-side; alternatively reuse the existing notes list already fetched in the sidebar
- No database schema changes required
