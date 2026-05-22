## Why

The current TipTap WYSIWYG editor is a heavyweight dependency with three custom extensions that must be maintained in sync with TipTap internals. Storing content as TipTap JSON makes content opaque — it can't be read or edited outside the app. Switching to markdown with explicit view and edit modes gives users a transparent, portable format, simplifies the dependency tree, and removes the custom extension maintenance burden.

## What Changes

**Note Editor Surface**
- From: Single TipTap WYSIWYG editor; content stored as TipTap JSON in `note.body`
- To: View/Edit mode toggle; view mode renders markdown via react-markdown; edit mode uses CodeMirror 6 with syntax highlighting; content stored as raw markdown strings
- Reason: Simpler architecture, portable format, no TipTap maintenance overhead
- Impact: Non-breaking for users (same features preserved); breaking for any tooling that reads `note.body` as JSON

**Wikilink Rendering and Autocomplete**
- From: TipTap WikilinkExtension renders `[[slug]]` nodes inline; autocomplete via custom TipTap plugin
- To: react-markdown preprocesses `[[slug]]` and `[[slug|display]]` → standard markdown links before rendering; CodeMirror autocomplete extension triggers on `[[` using Fuse.js
- Reason: Required by editor change; no TipTap available in view mode
- Impact: Non-breaking (same UX, same syntax)

**Cloze Syntax and Rendering**
- From: TipTap ClozeExtension renders cloze nodes; syntax stored as TipTap node type
- To: `{{c1::answer}}` syntax in markdown; rendered as always-visible highlighted `<span>` in view mode; extracted on save via regex
- Reason: Anki-compatible syntax; no TipTap node type available
- Impact: Non-breaking for users (same visual result); stored syntax changes

**Task Detection**
- From: TipTap TaskItemExtension; task items stored as JSON nodes
- To: GFM-style `- [ ]` / `- [x]` in markdown; detected on save via regex `/^- \[[ x]\] .+/gm`
- Reason: Standard markdown task list syntax; no TipTap extension required
- Impact: Non-breaking (same UX)

**Notes List Excerpt**
- From: Excerpt taken directly from TipTap JSON text nodes
- To: Excerpt strips markdown syntax (headings, bold, wikilinks) via `stripMarkdown()` utility before truncating to 120 characters
- Reason: Raw markdown syntax would appear in the list otherwise
- Impact: Non-breaking for users

## Capabilities

### New Capabilities

*(none — all features are replacements of existing capabilities)*

### Modified Capabilities

- `note-editor`: Fundamental change from TipTap WYSIWYG to CodeMirror 6 markdown editor with explicit view/edit mode toggle; storage format changes from TipTap JSON to raw markdown
- `wiki-linking`: Rendering moves from TipTap extension to react-markdown preprocessing; autocomplete moves to CodeMirror extension
- `flashcard-system`: Cloze items use `{{c1::answer}}` markdown syntax; rendered as always-visible spans (no reveal interaction); extraction moves to regex on save
- `task-management`: Task items use GFM `- [ ]` syntax; detection moves to regex on save

## Impact

**Removed dependencies**: All `@tiptap/*` npm packages, custom TipTap extensions (`WikilinkExtension`, `TaskItemExtension`, `ClozeExtension`)

**Added dependencies**: `react-markdown`, `remark-gfm`, `@codemirror/view`, `@codemirror/state`, `@codemirror/lang-markdown`, `@codemirror/autocomplete`

**Removed files**: `components/editor/NoteEditor.tsx`, `components/editor/WikilinkAutocomplete.tsx`, `components/editor/extensions/*`

**Added files**: `components/editor/NoteViewer.tsx`, `components/editor/NoteMarkdownEditor.tsx`

**Data**: No production data exists; local dev data can be re-seeded. No Prisma schema migration needed.
