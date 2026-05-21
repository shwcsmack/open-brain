## Context

The app has a TipTap-based wikilink system. Wikilinks are atom nodes with attrs `noteId`, `noteSlug`, `title`, and `resolved`. The InputRule triggers on `[[...]]`, an autocomplete popup (Fuse.js over note titles + tags) lets the user pick a note, and the resolved chip renders `[[title]]` in the editor.

Currently all wikilinks display the real note title — there is no way to link to a note using a different display phrase. The request is to support "aliases": writing natural-sounding text (e.g. "ascent") that links to a page with a longer or different name (e.g. "Our Subaru Ascent"). Wikilink data lives entirely in the note body JSON; there are no DB-level link tables to update.

## Goals / Non-Goals

**Goals:**
- Allow a wikilink to display custom text (alias) instead of the real note title
- Support pipe syntax (`[[Our Subaru Ascent|ascent]]`) for alias entry while typing
- Support select-to-link flow (`Cmd+K` or `[[` while text is selected) for aliasing already-written text
- Render aliased chips distinctly (tilde prefix + tooltip) so the link target is discoverable

**Non-Goals:**
- No database migrations — wikilinks are stored in note body JSON only
- No API changes — backlink extraction uses `noteId` and is unaffected
- No new files — all changes land in existing extension and editor files
- Autocomplete does not gain awareness of the alias being typed; pipe syntax is purely manual

## Decisions

### D1: Two creation flows, not one
- **Choice:** Support both pipe syntax and select-to-link rather than picking one.
- **Rationale:** Pipe syntax matches the Obsidian/Notion mental model for users who know the target upfront. Select-to-link matches the write-first, link-later workflow where the alias phrase already exists in the prose.
- **Alternatives considered:** Pipe syntax only — rejected because it requires knowing the alias before writing; select-to-link only — rejected because it's awkward when the user explicitly wants to type a link.

### D2: Nullable `displayText` attribute on the TipTap node
- **Choice:** Add a single nullable `displayText` attr (default `null`) to the wikilink node. `title` always holds the real note title.
- **Rationale:** Minimal schema change. The resolver, backlink extractor, and autocomplete all key off `noteId`/`title` — they need no modification. `displayText = null` means "no alias", preserving backward compatibility with all existing wikilinks.
- **Alternatives considered:** Separate alias node type — rejected as unnecessary complexity; storing alias in `title` and adding a separate `realTitle` — rejected because it would break all code that treats `title` as the canonical note name.

### D3: Select-to-link captures the selection before editor consumes `[[`
- **Choice:** For `[[`-while-selected, a `keydown` handler saves the selection text to a `pendingAliasRef` on the first `[`, before the editor processes the keystroke. On the second `[`, autocomplete opens normally; on pick, `displayText = pendingAliasRef.current`.
- **Rationale:** TipTap's InputRule replaces the `[[` text, so the selection is gone by the time a pick is made. The ref must be captured earlier.
- **Alternatives considered:** Save selection in editor state via a TipTap plugin — more principled but more complex; not warranted for a single-field capture.

### D4: Tilde prefix (`~alias`) for aliased chip rendering
- **Choice:** Aliased chips render as `~displayText` with a `title` tooltip (`→ Real Note Title`) and a `wikilink-aliased` CSS class. Regular chips are unchanged.
- **Rationale:** The tilde signals "this is a link in disguise" without being loud. Tooltip on hover reveals the target for discoverability.
- **Alternatives considered:** Italics or underline-only — too subtle, no indication of aliasing; showing `alias (→ title)` inline — too verbose for dense notes.

## Risks / Trade-offs

[Risk] `[[`-while-selected keydown timing — if TipTap or browser consumes the first `[` before the handler fires, `pendingAliasRef` won't be set. → Mitigation: handler uses `keydown` (fires before editor) and checks `event.key === "["` before any editor processing; covered by integration tests.

[Risk] Pipe InputRule regex collision — extending the InputRule to match `[[title|alias]]` could interfere with future syntax (e.g., `[[title|display|extra]]`). → Mitigation: regex is anchored to exactly one pipe; additional pipes are treated as literal characters and won't match.

[Trade-off] Autocomplete ignores the alias being typed in pipe syntax — the popup searches by the fragment before the pipe, not the alias. Accepted: keeping autocomplete logic simple outweighs the edge case where the alias could narrow results.

## Migration Plan

N/A — this change is purely frontend (TipTap extension + React component). No deployment steps, no DB migrations, no rollback strategy required. Existing notes with no `displayText` attr behave identically to today.

## Open Questions

<!-- None identified — brainstorm reached consensus on all key decisions. -->
