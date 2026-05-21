## 1. Data Model

- [x] 1.1 Add nullable `displayText: string | null` attribute (default `null`) to the wikilink TipTap node schema in `WikilinkExtension.ts`
- [x] 1.2 Update `insertWikilink` in `NoteEditor.tsx` to accept an optional `displayText` parameter and pass it into the node attrs on insert

## 2. Pipe Syntax (InputRule)

- [x] 2.1 Extend the InputRule regex in `WikilinkExtension.ts` to match both `[[title]]` and `[[title|alias]]` forms
- [x] 2.2 In the InputRule handler, detect a pipe character and split into `title` and `displayText`; set `displayText = null` for the no-pipe form

## 3. Chip Rendering

- [x] 3.1 Update `renderHTML` in `WikilinkExtension.ts` to emit `~displayText` text content and include `wikilink-aliased` in the class list when `displayText` is non-null
- [x] 3.2 Update `addNodeView` to render aliased chips with `~displayText` inner text and a `title="→ {title}"` attribute for the hover tooltip
- [x] 3.3 Add `wikilink-aliased` CSS rule to visually distinguish aliased chips from standard resolved chips

## 4. Select-to-Link: Cmd+K

- [x] 4.1 Add a `Cmd+K` keydown handler in `NoteEditor.tsx` that reads the current editor selection and stores it as `pendingAlias`
- [x] 4.2 Open the note picker pre-seeded with the selected text as the initial search query
- [x] 4.3 On note pick with a non-empty `pendingAlias`, call `insertWikilink` with `displayText = pendingAlias` replacing the selection; clear `pendingAlias` after use

## 5. Select-to-Link: `[[` While Selected

- [x] 5.1 Add a `keydown` handler on the `[` key that saves the current selection text to a `pendingAliasRef` when text is selected (fires before the editor consumes the keystroke)
- [x] 5.2 On autocomplete pick, check `pendingAliasRef.current`; if set, use it as `displayText` when calling `insertWikilink`
- [x] 5.3 Clear `pendingAliasRef` when the autocomplete popup closes without a pick

## 6. Tests

- [x] 6.1 Add InputRule test: `[[Our Subaru Ascent|ascent]]` produces a wikilink node with `title = "Our Subaru Ascent"` and `displayText = "ascent"`
- [x] 6.2 Add InputRule test: `[[Biology]]` produces a node with `displayText = null` (existing behavior unaffected)
- [x] 6.3 Add rendering test: node with `displayText = "ascent"` renders with tilde prefix and `wikilink-aliased` class in `renderHTML` output
- [x] 6.4 Add rendering test: node with `displayText = null` renders as `[[Note Title]]` with no extra class
