# Brainstorm: markdown-note-view-edit-mode

Raw capture of brainstorming session — 2026-05-21

---

## Background

The notes app currently uses a **TipTap v2 WYSIWYG editor** for all note editing. Content is stored as TipTap JSON in the `note.body` DB column. The editor has three custom TipTap extensions: WikilinkExtension (renders `[[slug]]` as clickable links), TaskItemExtension (GFM-style checkboxes), and ClozeExtension (flashcard cloze deletions).

The request: switch notes to markdown format with separate **view mode** (rendered markdown) and **edit mode** (raw markdown text). Remove TipTap entirely.

---

## Decision Chain

### Q1: Where should the view/edit mode toggle live?

Options: toolbar button, floating button on content area, segmented View/Edit control in header.

**Decision → C: Segmented View | Edit pill control in the header toolbar.** Makes the two modes feel first-class and always visible. Sits between the title and Save button.

---

### Q2: Should content storage change to markdown, or keep TipTap JSON and serialize on the fly?

Options:
- A: Switch storage to markdown (one-time migration script)
- B: Keep TipTap JSON, serialize to markdown for editing (complex, lossy round-trip with custom extensions)

**Decision → A: Switch storage to markdown.** Cleaner architecture. Requires a one-time migration script converting all existing TipTap JSON → markdown. The DB column stays `String` — no Prisma schema migration needed, just data format change.

---

### Q3: What should the edit mode editing surface be?

Options:
- A: Plain textarea
- B: CodeMirror 6 with markdown syntax highlighting
- C: TipTap in source mode (keep TipTap)

**Decision → B: CodeMirror 6, and remove TipTap entirely.** CodeMirror provides syntax highlighting without TipTap's WYSIWYG complexity. Removing TipTap simplifies the dependency tree significantly.

---

### Q4: Keep the `[[` wikilink autocomplete in edit mode?

**Decision → Yes.** CodeMirror 6's `@codemirror/autocomplete` package supports custom completers. A custom extension triggers on `[[` and shows fuzzy-searched note suggestions via the existing Fuse.js setup.

---

### Q5: Keep the cloze feature? What syntax?

**Decision → Yes, keep cloze. Syntax: `{{c1::answer}}`.** Anki-style cloze syntax. In view mode, rendered as a highlighted inline span. In edit mode, appears as raw text. Extracted on save via regex `/\{\{c(\d+)::([^}]+)\}\}/g`.

---

### Q6: How should existing TipTip JSON content be migrated?

Options:
- A: One-time migration script (run before deploy)
- B: Lazy migration on open (convert on first load)

**Decision → A: One-time migration script.** Clean slate. Script is idempotent (skips notes whose body doesn't start with `{`). Walks TipTap JSON nodes recursively, outputs markdown.

---

### Q7: Auto-save semantics in edit mode?

Options:
- A: Explicit save — mode switch triggers save, Save button stays, auto-save debounce continues
- B: Auto-save only — remove Save button entirely
- C: Split live-preview pane

**Decision → A: Explicit save with auto-save debounce.** Predictable save semantics. Switching Edit → View triggers a save. Auto-save debounce (1s after typing stops) continues. Save button stays for explicit saves. Simplest state machine.

---

## Design Summary

### Architecture

- **Storage**: `note.body` stores raw markdown strings
- **View mode**: `react-markdown` + `remark-gfm`. Wikilinks preprocessed before rendering: `[[slug|display]]` and `[[slug]]` → standard markdown links → `/notes/slug`. Cloze `{{c1::answer}}` → highlighted `<span>` via custom remark plugin.
- **Edit mode**: CodeMirror 6 (`@codemirror/lang-markdown`) with custom `[[` autocomplete extension using Fuse.js.
- **Migration**: `scripts/migrate-tiptap-to-markdown.ts` — converts all existing TipTap JSON notes to markdown.

### Components

**Removed:**
- `components/editor/NoteEditor.tsx`
- `components/editor/WikilinkAutocomplete.tsx`
- `components/editor/extensions/WikilinkExtension.ts`
- `components/editor/extensions/TaskItemExtension.ts`
- `components/editor/extensions/ClozeExtension.ts`
- All `@tiptap/*` npm packages

**Added:**
- `components/editor/NoteViewer.tsx` — view mode markdown renderer (props: `markdown: string` only — no notes list needed, wikilinks are slug-based)
- `components/editor/NoteMarkdownEditor.tsx` — CodeMirror edit mode editor
- `scripts/migrate-tiptap-to-markdown.ts` — one-time migration
- npm: `react-markdown`, `remark-gfm`, `@codemirror/view`, `@codemirror/state`, `@codemirror/lang-markdown`, `@codemirror/autocomplete`

### Note Page State Machine

```
mode: 'view' | 'edit'  (default: 'view')

View mode:
  → renders <NoteViewer markdown={note.body} />
  → title Input always editable
  → Save button saves title only

Edit mode:
  → renders <NoteMarkdownEditor value={note.body} onChange={...} notes={notes} />
  → auto-save debounce (1s after typing stops)
  → Save button saves immediately
  → switching back to View triggers save
```

### Notes List Excerpt

The home page shows a 120-character excerpt of each note's body. With markdown storage, the excerpt must strip markdown syntax (headings `#`, bold `**`, wikilinks `[[...]]`, etc.) before truncating, so plain readable text appears in the list. A `stripMarkdown(md: string): string` utility handles this.

### Save Side-Effects (regex-based, replaces TipTap JSON extraction)

- **Wikilinks**: `/\[\[([^\]|]+)/g` extracts slugs → `noteLink.sync`
- **Task items**: `/^- \[[ x]\] .+/gm` → `task.syncFromNote`
- **Cloze items**: `/\{\{c(\d+)::([^}]+)\}\}/g` → `flashcard.syncCloze`

### UI Layout

Header (both modes):
```
← Notes | [Title Input] | [View] [Edit] | Save | Graph | Delete
```

View mode body: rendered markdown, wikilinks as `<a>` tags, cloze as highlighted spans, task lists with checkboxes.

Edit mode body: CodeMirror with dark/themed syntax highlighting. `[[` triggers autocomplete dropdown with fuzzy-matched notes list.

### Migration Script Behavior

- Reads all notes from DB
- Skips notes whose `body` doesn't start with `{` (already markdown or empty)
- Walks TipTap JSON node tree recursively:
  - `paragraph` → text with newlines
  - `heading` → `#`/`##`/`###` prefix
  - `bold` mark → `**text**`
  - `italic` mark → `*text*`
  - `code` mark → `` `text` ``
  - `codeBlock` → fenced code block
  - `blockquote` → `> text`
  - `bulletList`/`orderedList` → `-` / `1.` items
  - `taskItem` → `- [ ]` or `- [x]`
  - `wikilink` node → `[[noteSlug]]` or `[[noteSlug|displayText]]`
  - `cloze` node → `{{c{index}::{answer}}}`
- Updates `note.body` in place
