## Why

Wikilinks currently always display the real note title, forcing users to link in-context with whatever the note is named. There is no way to write natural prose and link a word or phrase to a differently-titled page. Aliases fix this: a user can write "ascent" in a sentence and have it link to "Our Subaru Ascent" without breaking the reading flow.

## What Changes

**Wikilink node data model**
- From: Node attrs are `noteId`, `noteSlug`, `title`, `resolved` — title is always the display text.
- To: A nullable `displayText` attr is added. When set, it is shown instead of `title`. `title` always holds the real note name.
- Reason: Separates display identity from link target without affecting backlink resolution.
- Impact: Non-breaking; existing wikilinks have `displayText = null` and behave identically.

**Wikilink creation — pipe syntax**
- From: InputRule only matches `[[title]]`.
- To: InputRule also matches `[[title|alias]]`; the alias becomes `displayText`.
- Reason: Enables alias entry for users who know both the target and alias upfront.
- Impact: Non-breaking; existing `[[title]]` patterns are unaffected.

**Wikilink creation — select-to-link**
- From: No way to convert selected text into a wikilink.
- To: `Cmd+K` while text is selected opens the note picker; on pick, selected text becomes the alias. `[[` while text is selected does the same.
- Reason: Enables the write-first, link-later workflow without retyping.
- Impact: New keyboard interaction; no conflicts with existing shortcuts.

**Wikilink rendering**
- From: All resolved chips render as `[[title]]`.
- To: Aliased chips render as `~alias` with a tooltip (`→ Real Note Title`) and a `wikilink-aliased` CSS class. Non-aliased chips are unchanged.
- Reason: Distinguishes aliased links from normal ones so the target is always discoverable.
- Impact: Visual only; no behavior change for non-aliased links.

## Capabilities

### New Capabilities
- `wikilink-aliases`: Alias creation (pipe syntax + select-to-link) and aliased chip rendering with tooltip disclosure.

### Modified Capabilities
- `wiki-linking`: Wikilink node data model gains a nullable `displayText` attribute, changing the spec-level contract for what a wikilink node contains.

## Impact

- `WikilinkExtension.ts` — add `displayText` attr; extend InputRule regex; update `renderHTML` and `addNodeView`
- `NoteEditor.tsx` — update `insertWikilink` to accept optional `displayText`; add `Cmd+K` handler; add `[[`-while-selected selection capture
- `WikilinkExtension.test.ts` — new test cases for pipe syntax and aliased rendering
- No DB migrations, no API changes, no new files
