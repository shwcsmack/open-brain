## Context

The notes app currently uses TipTap v2 (a WYSIWYG rich-text editor) as the sole editing surface. Note content is stored as TipTap JSON in the `note.body` DB column. Three custom TipTap extensions handle app-specific features: WikilinkExtension (`[[slug]]` → clickable links), TaskItemExtension (GFM-style checkboxes), and ClozeExtension (flashcard cloze deletions).

This change replaces TipTap entirely with a markdown-based editing model: raw markdown stored in the DB, a rendered view mode (react-markdown), and a syntax-highlighted edit mode (CodeMirror 6). All three custom features (wikilinks, tasks, cloze) are preserved but implemented via regex rather than TipTap node types.

## Goals / Non-Goals

**Goals:**
- Replace TipTap with a view/edit mode toggle (View = rendered markdown, Edit = CodeMirror 6)
- Store content as raw markdown strings (one-time migration from TipTap JSON)
- Preserve wikilink `[[slug]]` rendering and `[[` autocomplete in edit mode
- Preserve task list checkboxes in view mode; sync tasks on save via regex
- Preserve cloze `{{c1::answer}}` syntax; render as highlighted spans in view mode
- Remove all `@tiptap/*` npm dependencies
- Show plain-text excerpts in the notes list (strip markdown syntax before truncating)

**Non-Goals:**
- Live split-pane preview (view and edit simultaneously)
- Real-time collaborative editing
- Changing the DB schema (column stays `String`, no Prisma migration)
- Supporting TipTap-specific features not representable in markdown

## Decisions

### D1: View/Edit mode toggle placement
- **Choice**: Segmented View | Edit pill control in the header toolbar, between the title input and Save button
- **Rationale**: Makes both modes feel first-class and permanently visible; reduces discoverability problems compared to a floating or contextual button
- **Alternatives considered**: Toolbar button (less prominent), floating button on content area (context-dependent, easy to miss)

### D2: Content storage format
- **Choice**: Switch `note.body` to raw markdown strings with a one-time migration script
- **Rationale**: Clean architecture — no serialization layer, no lossy round-trips. DB column type unchanged (stays `String`)
- **Alternatives considered**: Keep TipTap JSON, serialize to markdown on the fly — rejected because the round-trip with custom extension nodes is lossy and complex to maintain

### D3: Edit mode editor
- **Choice**: CodeMirror 6 with `@codemirror/lang-markdown` and a custom `[[` autocomplete extension
- **Rationale**: Provides syntax highlighting without TipTap's WYSIWYG complexity; CodeMirror's extension model supports custom completers via `@codemirror/autocomplete`; removes TipTap from the dependency tree entirely
- **Alternatives considered**: Plain `<textarea>` (no syntax highlighting), TipTap in source mode (keeps the dependency, adds complexity)

### D4: Wikilink autocomplete in edit mode
- **Choice**: Keep `[[` autocomplete using CodeMirror 6's `@codemirror/autocomplete` with Fuse.js for fuzzy matching
- **Rationale**: Feature parity with existing TipTap autocomplete; CodeMirror's extension API makes this straightforward; Fuse.js already in the dependency tree

### D5: Cloze syntax
- **Choice**: `{{c1::answer}}` (Anki-style). In view mode: always-visible highlighted `<span>` (no reveal interaction). In edit mode: raw text. Extracted on save via regex `/\{\{c(\d+)::([^}]+)\}\}/g`
- **Rationale**: Familiar Anki convention; unambiguous in markdown (no conflict with standard syntax); simple regex extraction. Always-visible rendering keeps the note readable without interaction; reveal behavior belongs in a dedicated flashcard review UI, not the note viewer

### D6: TipTap JSON migration strategy
- **Choice**: No migration script needed — drop TipTap JSON support entirely
- **Rationale**: The app has never been deployed to production; all existing data is local dev test data. The DB column is reset to empty/markdown on next seed. No migration complexity, no idempotency requirements
- **Alternatives considered**: One-time migration script — unnecessary given no production data exists

### D7: Auto-save semantics
- **Choice**: Explicit save with auto-save debounce (1s after typing stops). Save button stays. Switching Edit → View **cancels the pending debounce and triggers one immediate save**
- **Rationale**: Cancelling the debounce on mode switch prevents a double-save (mode-switch save + debounce firing 1s later). One save fires, state is clean. Predictable; users retain an explicit save affordance
- **Alternatives considered**: Auto-save only with no Save button (less explicit), split live-preview pane (out of scope), letting debounce fire after mode switch (causes redundant network call and potential race)

## Risks / Trade-offs

[Trade-off] Removing TipTap loses WYSIWYG formatting affordances (bold/italic toolbar buttons) → Accepted: The target UX is explicitly markdown-first; power users prefer raw syntax

[Risk] CodeMirror theming mismatch with app's dark/light theme → Mitigation: Use CodeMirror's theme extension API; wire to existing theme context

[Trade-off] Notes list excerpt stripping must be maintained as markdown syntax evolves → Accepted: `stripMarkdown` utility is a small, testable function; regex-based and not a critical path

## Migration Plan

N/A — the app has not been deployed to production. No data migration is required. Existing local dev data can be cleared or re-seeded. Deploy is a straight code swap: remove TipTap packages, add CodeMirror + react-markdown, update the note page.

## Open Questions

None — all design decisions resolved.
