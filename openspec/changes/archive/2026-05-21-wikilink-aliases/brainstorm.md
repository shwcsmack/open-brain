---
date: 2026-05-21
change: wikilink-aliases
---

# Brainstorm: Wikilink Aliases

## Background

The app has a TipTap-based wikilink system. Wikilinks are atom nodes with attrs `noteId`, `noteSlug`, `title`, `resolved`. The InputRule triggers on `[[...]]`, an autocomplete popup (Fuse.js over note titles + tags) lets you pick a note, and the resolved chip renders `[[title]]` in the editor.

The request: write natural language text that links to a page with a different name. Example — "ascent" displayed in the note, linking to "Our Subaru Ascent".

---

## Decision Chain

**Q1: How should aliased wikilinks be created?**

Two flows, both supported:

- **Pipe syntax** (`[[Our Subaru Ascent|ascent]]`) — for when you know the alias upfront while typing. Autocomplete still fires on `[[`, but the pipe+alias is typed manually. InputRule catches the full `[[title|displayText]]` pattern.
- **Select-to-link** — write naturally first, then select a word and trigger a note picker. On pick, the selected text becomes the `displayText` and the chosen note becomes the target. Triggers: `Cmd+K` while text selected, or `[[` while text selected.

**Q2: How should an aliased chip look vs a regular wikilink?**

Subtle tilde prefix: aliased chips render as `~ascent`, regular chips render as `[[Our Subaru Ascent]]`. A `title` tooltip on hover reveals the real page name (`→ Our Subaru Ascent`). A `wikilink-aliased` CSS class drives the styling.

**Q3: What is the data model?**

Add a nullable `displayText` attribute to the wikilink TipTap node (default `null`). When set, it holds the alias text. `title` always stays as the real note title. No DB changes — wikilinks live in the note body JSON. `extractWikilinks` uses `noteId` so backlinks are unaffected.

---

## Design

### Data model

```
{
  noteId: string | null,
  noteSlug: string | null,
  title: string,           // always the real note title
  resolved: boolean,
  displayText: string | null  // new — alias text, null = no alias
}
```

### Creation flows

**Pipe syntax:** Extend InputRule regex from `/\[\[([^\]]+)\]\]$/` to also match `[[title|displayText]]`. When pipe form detected: `title = "Our Subaru Ascent"`, `displayText = "ascent"`. Autocomplete flow unchanged — it still inserts a normal resolved chip on pick; pipe syntax is for manual typing only.

**Select-to-link:**
- `Cmd+K` while text selected → capture selection as pending `displayText`, open autocomplete pre-seeded with it as query, on pick replace selection with resolved wikilink chip using `displayText = captured text`
- `[[` while text selected → a `keydown` handler on `[` saves the selection text to a `pendingAliasRef` before the editor consumes it; on the second `[`, autocomplete opens normally; on pick, `displayText = pendingAliasRef.current`; cleared when autocomplete closes without a pick

### Rendering

`addNodeView` and `renderHTML` check `displayText`:
- No alias → `[[title]]`, class `wikilink wikilink-resolved` (unchanged)
- With alias → `~displayText`, class `wikilink wikilink-resolved wikilink-aliased`, `title` attr = `→ {title}` for tooltip

### Components affected

| File | Change |
|------|--------|
| `WikilinkExtension.ts` | Add `displayText` attr; update InputRule regex; update `renderHTML` and `addNodeView` |
| `NoteEditor.tsx` | Update `insertWikilink` to accept optional `displayText`; add `Cmd+K` handler; update `[[` detection to capture selected text |
| `WikilinkExtension.test.ts` | Add cases for pipe InputRule and `displayText` rendering |

No DB migrations, no API changes, no new files.
