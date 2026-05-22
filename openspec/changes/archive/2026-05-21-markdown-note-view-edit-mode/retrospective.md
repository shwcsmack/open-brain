# Retrospective: markdown-note-view-edit-mode

> Written: 2026-05-21 (after verify passed with warnings)
> Commit range: `62bae9a..2fbd947` (1 artifact commit; implementation is working-tree only — uncommitted)
> Worktree: `.worktrees/markdown-note-view-edit-mode`

---

## 0. Evidence

- **Commit range**: `62bae9a..2fbd947` (1 commit — brainstorm artifact only)
- **Diff size**: +5,120 / -4,851 lines across 17 files (uncommitted working-tree changes)
- **Tasks done**: 31/31
- **Active hours**: ~4–5h (estimated from task scope and in-browser verification)
- **Subagent dispatches**: multiple (agent-browser for in-browser verification of wikilink autocomplete, cloze rendering, task sync — tasks 8.3, 8.4, 8.5)
- **New external dependencies**:
  - `react-markdown ^10.1.0` (MIT)
  - `remark-gfm ^4.0.1` (MIT)
  - `@codemirror/autocomplete ^6.20.2` (MIT)
  - `@codemirror/commands ^6.10.3` (MIT)
  - `@codemirror/lang-markdown ^6.5.0` (MIT)
  - `@codemirror/language ^6.12.3` (MIT)
  - `@codemirror/state ^6.6.0` (MIT)
  - `@codemirror/view ^6.43.0` (MIT)
  - Removed: all `@tiptap/*` packages (5 packages)
- **Bugs encountered post-merge**: none (implementation not yet merged)
- **OpenSpec validate state at archive**: 10/10 passed
- **Test coverage signal**: 8 suites / 98 tests pass (`npx jest` — task 8.2)

Commit chain (chronological):

```
62bae9a docs: require discovery interview for new OpenSpec changes  [base]
2fbd947 feat: add brainstorm artifact for markdown-note-view-edit-mode
[implementation uncommitted — working-tree only]
```

---

## 1. Wins

- [`NoteViewer.tsx`] **`rehypeCloze` hast-tree plugin is safer than `rehype-raw`**: the plan called for `rehype-raw` + HTML string injection to render cloze spans. The final implementation instead walks the hast tree and injects `span` nodes directly, so cloze answer text is always a TEXT node child — no HTML parsing means no XSS vector even for adversarial answer content.

- [`noteMarkdownSync.ts`] **Server-side extraction consolidation**: all three save side-effects (wikilink sync, task sync, cloze sync) moved to a single `syncNoteMarkdownDerivatives` function called from `note.update`. This eliminated the plan's client-side three-mutation fan-out against a potentially stale notes list, and removed a class of race conditions entirely.

- [`NoteMarkdownEditor.tsx`] **`pendingSaveRef` FIFO queue** prevents double-save on mode-switch: a pending debounce autosave that already left the page could race a mode-switch save. Chaining saves through a promise queue serializes them without requiring cancellation of in-flight requests.

- [`NoteMarkdownEditor.tsx`] **CodeMirror handles keyboard navigation natively**: Escape, ↑/↓ in dropdown, and Enter-to-select are all built into `@codemirror/autocomplete`'s default keymap — no custom logic needed for 4 of the 6 autocomplete keyboard scenarios in the spec.

- [`tasks.md`] **Fuse.js reuse**: the autocomplete fuzzy-matching used the existing Fuse.js dependency (already in the tree) — no new dependency for search.

- [`app/settings/page.tsx`] **Settings page TipTap consumer discovered and removed**: task 7.6 discovered the periodic-template editor in settings was the last TipTap consumer and converted it to `NoteMarkdownEditor`, fully eliminating `@tiptap/*` from the tree.

- [tasks 8.3–8.5] **In-browser verification via agent-browser**: all three manual verification tasks confirmed real rendered behavior (autocomplete dropdown, `.cloze-highlight` span, `/tasks` sync) — not just TypeScript compilation.

---

## 2. Misses

- 🟡 [painful | verify.md §5] **Implementation is entirely uncommitted**: all code changes exist as working-tree modifications with no commit history. This means no atomic rollback points, no `git blame` trail, and the FIFO save queue reasoning (documented inline in comments) has no corresponding commit message for future readers. Task 8.2 noted "Confirm `tsc --noEmit` passes" but not "commit the changes" — plan lacked explicit commit steps in the final verification section.

- 🟡 [painful | brainstorm.md §Q6 vs design.md D6] **Migration script scope churn**: brainstorm committed to "one-time migration script" as the plan (Q6 decision A), but design.md D6 reversed this ("No migration script needed"). The reversal was correct (no prod data), but it meant the brainstorm's architecture summary and plan.md's file map both referenced `scripts/migrate-tiptap-to-markdown.ts` — a file that was never created. Readers of those artifacts see a ghost artifact.

- 📌 [nit | `NoteMarkdownEditor.tsx`] **`value` prop reconciliation comment is dense**: the multi-paragraph comment explaining why `lastEmittedValueRef` must be updated *before* `view.dispatch(...)` is correct but long for a prop-sync pattern that may appear again. Worth extracting to a general CodeMirror pattern note.

---

## 3. Plan deviations

| Plan task | What changed | Why |
|---|---|---|
| Task 4: NoteViewer cloze | Plan used `rehype-raw` + HTML string injection; implementation used `rehypeCloze` hast plugin | XSS: `rehype-raw` would parse `<script>` inside cloze answers; hast plugin keeps answer as TEXT node |
| Task 5: NoteMarkdownEditor props | Plan used `initialValue` prop; implementation uses `value` prop + reconciliation effect | Controlled component pattern needed to propagate server-echoed body updates without cursor displacement |
| Task 7: server-side sync | Plan had three client-side tRPC mutations (`syncLinks`, `syncTasks`, `syncCloze`); implementation consolidated into `syncNoteMarkdownDerivatives` in `note.update` | Eliminates race with stale notes list on client; server is the source of truth for resolved slugs |
| D6 (brainstorm Q6): migration | Brainstorm committed to migration script; design.md D6 reversed to no-script | No prod data; local dev data is re-seeded. Migration script appears in brainstorm/plan as a ghost artifact |
| Task 7.6: TipTap removal | Extended scope: settings page periodic-template editor also converted from TipTap | Discovered during TipTap import sweep — last `@tiptap/*` consumer |

---

## 4. Skill / workflow compliance

| Skill | Used |
|---|---|
| superpowers:brainstorming | ✓ |
| superpowers:writing-plans | ✓ |
| superpowers:using-git-worktrees | ✓ |
| superpowers:subagent-driven-development | ✓ (agent-browser dispatches for tasks 8.3–8.5) |
| (transitive) superpowers:test-driven-development | ✓ (markdownExtract, stripMarkdown, NoteViewer, NoteMarkdownEditor tests all written) |
| (transitive) superpowers:requesting-code-review | ✗ |
| superpowers:finishing-a-development-branch | ✗ (not yet run — implementation uncommitted) |

### Deliberately Skipped Skills

- **`superpowers:requesting-code-review`**
  - **What was skipped**: the entire code review skill — no review was requested for the ~5,000-line diff
  - **Why this cycle**: the implementation was done as working-tree changes without a commit history; there was no diff to submit for review. A code review against uncommitted changes is possible but awkward since there is no PR or commit range to anchor feedback to. The practical trigger was the lack of a committed branch.
  - **How to prevent recurrence**: `scope-judgment rule` — when a change exceeds ~200 lines of logic, request code review before the verify step regardless of commit state. Add to the finishing-a-development-branch skill trigger: "if diff > 200 lines and no review was done, request one before completing."

- **`superpowers:finishing-a-development-branch`**
  - **What was skipped**: the skill was not invoked; implementation is uncommitted and unmerged
  - **Why this cycle**: the retrospective is being written before the finishing step by workflow design (retrospective comes before archive). However, the uncommitted state means finishing-a-development-branch still needs to run after this retrospective.
  - **How to prevent recurrence**: `one-off — schema boundary case`. The superpowers-bridge schema writes retrospective before the finishing step. This is a schema-level ordering. Non-blocking: the finishing step is the explicit next action after archive. Document in verify.md §5 action list (already done).

---

## 5. Surprises

- **`rehype-raw` is a security risk in this context**: the plan assumed `rehype-raw` was the right tool for injecting cloze HTML spans. During implementation it became clear that `rehype-raw` evaluates raw HTML strings from the markdown source — meaning `{{c1::<script>alert(1)</script>}}` would execute. The hast plugin approach was not in the original plan.

- **CodeMirror's autocompletion keymap is batteries-included**: the spec listed 6 keyboard interaction scenarios (Enter, ↑/↓, Escape, click). CodeMirror's `autocompletion()` default keymap covers all of them without custom bindings — the only code needed was the `CompletionSource` function.

- **Three client-side sync mutations created a race condition**: the plan expected three separate client-side mutations (`syncLinks`, `syncTasks`, `syncCloze`) after each save. During implementation it became clear that `syncLinks` depended on the current notes list (to resolve slugs to IDs) and that the notes list could be stale (cached, 30s refetch interval). Moving extraction to the server-side `note.update` handler resolved this by letting the server query fresh slug→id mappings.

- **`[` autocomplete regex requires careful boundary conditions**: the plan's trigger regex `/\[\[[^\]]*$/` (prefix match) would fire even after `[[slug|` (in the alias portion). The implementation refined this to `/\[\[[^\]\n|]+/` — `|` as a terminator so typing an alias doesn't re-trigger note search.

---

## 6. Promote candidates → long-term learning

- [ ] 🟡 **Commit after each plan task, not at the end of the cycle** → **Promote to memory** (type: feedback)
  > **Why**: This cycle produced ~5,000 lines of uncommitted code with no atomic rollback points, no `git blame` trail, and a verify.md that had to flag the uncommitted state as a warning. Future audit or bisect is impossible.
  > **How to apply**: Whenever following a plan with discrete tasks, commit after each task group (or at minimum after each major component). If a task's plan step says "Commit," actually commit — don't batch all commits to the end.

- [ ] 🟡 **Never use `rehype-raw` for user-generated content; prefer hast tree plugins** → **Promote to project CLAUDE.md** (`open-brain/CLAUDE.md` or `open-brain/AGENTS.md`)
  > **Why**: `rehype-raw` parses raw HTML strings from markdown source and evaluates them, creating an XSS vector when the markdown contains user-authored content with embedded HTML tags. A custom rehype plugin that injects hast nodes directly keeps answer text as TEXT nodes, never evaluated as HTML.
  > **How to apply**: Any time a react-markdown/remark/rehype pipeline needs to inject custom HTML elements into rendered markdown, write a rehype plugin that manipulates the hast tree rather than injecting HTML strings via `rehype-raw`.

- [ ] 🟡 **Server-side extraction is safer than client-side fan-out for derived state** → **Promote to memory** (type: project)
  > **Why**: Client-side tRPC mutations for wikilink/task/cloze sync depended on the notes list (for slug→ID resolution), which could be stale (30s cache). Moving extraction to `note.update` on the server guarantees fresh DB lookups and eliminates a whole class of race conditions where client state lags behind server state.
  > **How to apply**: When a save operation produces derived state that depends on other DB records (e.g., FK lookups), prefer performing the derivation in the mutation handler rather than as client-side follow-up mutations.

- [ ] 📌 **Ghost artifacts from brainstorm-to-design scope reversals should be explicitly retracted** → **One-off** (record in this retro, no general promote)
  > **Why**: brainstorm.md committed to a migration script; design.md D6 reversed it. Both artifacts still reference the script. Future readers see `scripts/migrate-tiptap-to-markdown.ts` in the brainstorm file map and plan table-of-files, but it was never created. A one-line retraction note in the brainstorm ("D6 in design.md supersedes this section") would prevent confusion.
  > **How to apply**: when design.md overrides a brainstorm decision, add a forward-pointer in brainstorm.md's affected section. Doesn't generalize beyond careful per-cycle editing.
