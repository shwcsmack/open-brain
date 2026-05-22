## 1. Install Dependencies

- [x] 1.1 Install `react-markdown` and `remark-gfm`
- [x] 1.2 Install `@codemirror/view`, `@codemirror/state`, `@codemirror/lang-markdown`, and `@codemirror/autocomplete`

## 2. Create NoteViewer Component

- [x] 2.1 Create `components/editor/NoteViewer.tsx` that renders a markdown string via `react-markdown` + `remark-gfm`
- [x] 2.2 Add wikilink preprocessing: replace `[[slug|display]]` and `[[slug]]` with standard markdown links (`[display](/notes/slug)`) before passing to react-markdown
- [x] 2.3 Add cloze preprocessing: replace `{{cN::answer}}` with an always-visible highlighted `<span>` via a custom remark plugin or inline component
- [x] 2.4 Verify GFM task list checkboxes render correctly in view mode (react-markdown + remark-gfm handles `- [ ]` natively)

## 3. Create NoteMarkdownEditor Component

- [x] 3.1 Create `components/editor/NoteMarkdownEditor.tsx` with a CodeMirror 6 editor using `@codemirror/lang-markdown`
- [x] 3.2 Wire the CodeMirror theme to the app's existing dark/light theme context
- [x] 3.3 Implement a custom `[[` autocomplete extension using `@codemirror/autocomplete` and Fuse.js: triggers after `[[`, fuzzy-matches on note title + tags, inserts `[[slug]]` on selection
- [x] 3.4 Expose `value: string` and `onChange: (value: string) => void` props

## 4. Update Note Page State Machine

- [x] 4.1 Add `mode: 'view' | 'edit'` state to the note detail page (default: `'view'`)
- [x] 4.2 Add the View | Edit segmented pill control to the header toolbar between the title input and Save button
- [x] 4.3 Render `<NoteViewer>` when `mode === 'view'` and `<NoteMarkdownEditor>` when `mode === 'edit'`
- [x] 4.4 On Edit → View transition: cancel the pending auto-save debounce and trigger one immediate save before switching modes
- [x] 4.5 Pass the notes list to `<NoteMarkdownEditor>` for autocomplete; `<NoteViewer>` needs only the markdown string

## 5. Update Save Side-Effects to Regex-Based Extraction

- [x] 5.1 Update wikilink extraction in the `note.update` tRPC handler: replace TipTap JSON node walking with regex `/\[\[([^\]|]+)/g` to extract slugs for `noteLink.sync`
- [x] 5.2 Update task sync in the `note.update` handler: replace TipTap task node extraction with regex `/^- \[[ x]\] .+/gm` for `task.syncFromNote`
- [x] 5.3 Update cloze extraction in the `note.update` handler: replace TipTap cloze node extraction with regex `/\{\{c(\d+)::([^}]+)\}\}/g` for `flashcard.syncCloze`

## 6. Update Notes List Excerpt

- [x] 6.1 Create a `stripMarkdown(md: string): string` utility that removes headings (`#`), bold/italic (`**`, `*`, `__`, `_`), wikilinks (`[[...]]`), inline code (`` ` ``), and other markdown tokens to produce plain text
- [x] 6.2 Apply `stripMarkdown` to the note body before truncating to 120 characters in the notes list query or component

## 7. Remove TipTap

- [x] 7.1 Delete `components/editor/NoteEditor.tsx`
- [x] 7.2 Delete `components/editor/WikilinkAutocomplete.tsx`
- [x] 7.3 Delete `components/editor/extensions/WikilinkExtension.ts`
- [x] 7.4 Delete `components/editor/extensions/TaskItemExtension.ts`
- [x] 7.5 Delete `components/editor/extensions/ClozeExtension.ts`
- [x] 7.6 Uninstall all `@tiptap/*` npm packages (also uninstalled unused `rehype-raw`; deleted leftover serializer tests `tests/wikilink-serializer.test.ts`, `tests/cloze-serializer.test.ts`, and `components/editor/extensions/__tests__/WikilinkExtension.test.ts`; converted `app/settings/page.tsx` periodic-template editor from TipTap to `NoteMarkdownEditor` so the last `@tiptap/*` consumer is gone)

## 8. Cleanup and Verify

- [x] 8.1 Resolve any remaining TypeScript errors from removed TipTap imports
- [x] 8.2 Confirm `tsc --noEmit` passes with no errors (also `npx jest`: 8 suites / 98 tests pass)
- [x] 8.3 Manually verify: create a note, add `[[slug]]` wikilink, switch view/edit, confirm link renders and autocomplete works *(verified in-browser via agent-browser: typing `[[stu` in edit mode opened the completion dropdown showing "Study Notes" with its `study flashcards` tags; pressing Enter inserted `[[study-notes]]`; View mode rendered both `[[study-notes]]` and `[[my-projects|Projects]]` as anchor links to `/notes/study-notes` and `/notes/my-projects`.)*
- [x] 8.4 Manually verify: add `{{c1::answer}}` cloze syntax, confirm highlighted span renders in view mode *(verified in-browser: `.cloze-highlight` count = 1, `data-cloze-index="1"`, text content "oxidative phosphorylation".)*
- [x] 8.5 Manually verify: add `- [ ] task` checkbox, save, confirm task appears in `/tasks` *(verified in-browser: after autosave, `/tasks` shows "Verify wikilinks" under TO DO and "Done already" under DONE, both linked to the source note.)*
