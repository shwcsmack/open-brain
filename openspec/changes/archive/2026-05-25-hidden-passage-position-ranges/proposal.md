# Proposal: hidden-passage-position-ranges

## Why

The reading session's "Delete passage" feature has two silent bugs. Deleting a passage that
appears multiple times in an article hides every occurrence instead of just the selected one.
Deleting a passage from content with inline markdown formatting (bold, italic, links) silently
fails — the server saves the data but the tombstone never appears — because the matching regex
is built from DOM-visible text and run against raw markdown with formatting tokens interspersed.
Both bugs stem from the same root: storing selected text as the passage identity with no
location information. Switching to plain-text character offsets fixes both in one change.

## What Changes

**Hidden passage storage format**
- From: `hiddenPassages` stores `string[]` — the verbatim selected text
- To: `hiddenPassages` stores `Array<{ start: number, end: number }>` — plain-text character offsets within the rendered content
- Reason: Offsets uniquely identify a location; text does not
- Impact: Breaking change to DB column format; dev database will be cleared

**`reading.hidePassage` tRPC mutation input**
- From: `{ id: string, text: string }`
- To: `{ id: string, start: number, end: number }`
- Reason: Server stores what the client computed
- Impact: Breaking API change (client and server updated together)

**`reading.restorePassage` tRPC mutation input**
- From: `{ id: string, text: string }`
- To: `{ id: string, start: number, end: number }`
- Reason: Restore must identify passages by the same coordinate system used to store them
- Impact: Breaking API change (client and server updated together)

**Passage matching at render time**
- From: Regex built from stored text, run against raw markdown string
- To: remark AST walk builds plain-text→markdown offset map; stored offsets used for direct lookup
- Reason: Eliminates regex fragility and markdown-token mismatch
- Impact: Internal to `ExtractHighlighter`; no visible behavior change beyond correctness

**SelectionToolbar passage callback**
- From: `onDeletePassage(text: string)`
- To: `onDeletePassage(start: number, end: number)`
- Reason: Caller needs offsets, not text
- Impact: Breaking prop change; session page updated accordingly

## Capabilities

### New Capabilities
- None

### Modified Capabilities
- `reading-passage-deletion`: Storage format, API inputs, and matching logic all change; the
  behavioral requirement (hide exactly the selected passage, restore it) is the same but the
  implementation contract is fully replaced

## Impact

- `server/routers/reading.ts` — hidePassage and restorePassage input schemas
- `lib/readingQueue.ts` — hidePassage and restorePassage functions (store/remove objects)
- `components/reading/SelectionToolbar.tsx` — compute and emit offsets instead of text
- `components/reading/ExtractHighlighter.tsx` — replace markHiddenPassages regex with AST-based mapping
- `app/reading/session/page.tsx` — handleDeletePassage and handleRestorePassages signatures
- `openspec/specs/reading-passage-deletion/spec.md` — requirements updated to reflect new API and matching behavior
- Dev database — `hiddenPassages` column cleared
