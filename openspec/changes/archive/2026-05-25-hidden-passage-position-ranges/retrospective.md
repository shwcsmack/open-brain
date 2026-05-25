# Retrospective: hidden-passage-position-ranges

> Written: 2026-05-25 (after verify passed)
> Commit range: `2ba3660..e1ba43e`
> Worktree: `/Users/shayne/code/open-brain/.worktrees/hidden-passage-position-ranges`

---

## 0. Evidence

- **Commit range**: `2ba3660..e1ba43e` (2 commits)
- **Diff size**: 2,360 insertions / 164 deletions across 19 files
- **Tasks done**: 25/25 (`grep -cE '^\s*- \[x\]' tasks.md` -> 25)
- **Active hours**: ~1.5 hours from apply start through verify/retro
- **Subagent dispatches**: 21 implementation/review/fix dispatches
- **New external dependencies**: `mdast-util-from-markdown@^2.0.3` (MIT), `mdast-util-gfm@^3.1.0` (MIT), `micromark-extension-gfm@^3.0.0` (MIT), `unist-util-visit@^5.1.0` (MIT)
- **Bugs encountered post-merge**: None; pre-merge manual verification found and fixed one structural-newline offset drift
- **OpenSpec validate state at archive**: pass at verify time (`17/17` items valid)
- **Test coverage signal**: `npx tsc --noEmit` exit 0; `npm test` passed 136 Jest tests + 75 reading tests; browser smoke passed repeated/formatted/wikilink/Wikipedia-pill/session/detail restore cases

Commit chain:

```text
059a9b4 docs(openspec): seed hidden-passage-position-ranges change artifacts
e1ba43e fix(reading): store hidden passages as position ranges
```

---

## 1. Wins

- The core bug was fixed structurally: `lib/readingQueue.ts`, `server/routers/reading.ts`, and both reading pages now use `{ start, end }` ranges instead of selected text strings, which addresses repeated text and formatted markdown in one model.
- The renderer and selector now share an explicit coordinate contract: `ExtractHighlighter.tsx` maps markdown AST text positions, while `plainTextOffset.ts` walks annotated DOM text and ignores UI-only controls.
- The manual verification caught a real issue before archive: a ReactMarkdown structural newline shifted second-paragraph selections by one character. The fix landed with unit coverage in `tests/selectionToolbar.test.ts`.
- The test surface grew in the right places: `tests/extractHighlighter.test.ts` covers plain/bold/italic/link/wikilink/repeated/cross-paragraph cases, and `tests/reading.test.ts` covers range persistence and restore semantics.
- Review loops paid off: correctness review found session partial-restore desync and wikilink preprocessing mismatch before manual verification.

## 2. Misses

- 🟡 [painful] The original plan under-specified rendered-DOM coordinate alignment. Walking all DOM text would have counted tombstone labels, screen-reader suffixes, Wikipedia pill text, and ReactMarkdown structural newlines.
- 🟡 [painful] The first toolbar implementation marked tasks complete before review approval; `tasks.md` had to be corrected when the coordinate mismatch surfaced.
- 🟡 [painful] `markHiddenPassages` initially handled links but not emphasis boundaries well enough for the manual bold-after-tombstone scenario; the underlying drift was actually the structural newline mismatch.
- 📌 [nit] Hidden passage parsing/equality helpers are duplicated in `session/page.tsx`, `[id]/page.tsx`, `ExtractHighlighter.tsx`, and server parsing code with slightly different strictness.

## 3. Plan deviations

| Plan task | What changed | Why |
|-----------|--------------|-----|
| 3.1 / 3.3 | Replaced a simple text-node walker with `plainTextOffset.ts`, an annotated DOM walker with ignore and tombstone range semantics | Simple DOM text counting did not match `buildPlainTextMap(markdown)` once UI chrome and tombstones were present |
| 4.1 | Used `mdast-util-from-markdown` + GFM extensions instead of `unified` + `remark-parse` | Lower-level mdast parser exposed the same position data and was easier to load reliably under Jest once direct dependencies were declared |
| 4.2 | Expanded hidden ranges to preserve link/emphasis syntax boundaries where needed | Replacing only label text inside markdown syntax can leave broken markers or malformed links |
| 5.x | Added `5.5` for `app/reading/[id]/page.tsx` | Detail-page restore shares the `HiddenPassage[]` callback contract and failed TypeScript until updated |
| 6.5 | Added structural whitespace, ignored UI text, tombstone placeholder, and trim tests beyond the original within/across text-node tests | Browser verification and review showed those cases are part of correctness, not optional coverage |
| 7.1 | Added explicit manual browser verification task | The feature is selection/UI-heavy and needed browser evidence beyond unit and integration tests |

## 4. Skill / workflow compliance

| Skill                                            | Used |
|--------------------------------------------------|------|
| superpowers:brainstorming                        | ✓ (artifacts pre-existed in `brainstorm.md`) |
| superpowers:writing-plans                        | ✓ (artifacts pre-existed in `plan.md`) |
| superpowers:using-git-worktrees                  | ✓ |
| superpowers:subagent-driven-development          | ✓ |
| (transitive) superpowers:test-driven-development | ✓ |
| (transitive) superpowers:requesting-code-review  | ✓ |
| superpowers:finishing-a-development-branch       | Not yet reached; schema orders it after retrospective + archive |

### Deliberately Skipped Skills

- **`superpowers:finishing-a-development-branch`**
  - **What was skipped**: Not skipped permanently; not executed before this retrospective.
  - **Why this cycle**: The apply instructions explicitly order retrospective before archive and finishing-a-development-branch. At retro write time, `verify.md` exists and archive has not run yet.
  - **How to prevent recurrence**: `one-off — schema boundary case, no prevention possible`; the retrospective template asks about a skill that is intentionally scheduled after the retrospective step.

## 5. Surprises

- ReactMarkdown emits structural newline text nodes between block elements; these are visible to a DOM `TreeWalker` but not represented in mdast plain text.
- Browser smoke was necessary even with strong unit tests because the issue only appeared after combining ReactMarkdown output, tombstones, selection, and a second paragraph.
- Wikilink preprocessing had to happen before hidden-passage mapping; otherwise the rendered selection coordinate space diverged from the raw markdown coordinate space.
- Jest needed a targeted ESM transform allowlist once the implementation imported mdast/micromark utilities directly.
- The verify artifact requires implementation commits first, which means artifact generation and commit timing need to be explicit in this schema.

## 6. Promote candidates → long-term learning

- [ ] 🟡 **Selection features need a rendered-DOM coordinate contract, not just string offsets** → **Promote to memory**
  > **Why**: This cycle's first toolbar implementation counted UI chrome and ReactMarkdown structural whitespace, causing offset drift despite passing unit tests.
  > **How to apply**: When a feature stores text positions from browser selections, define which rendered nodes count toward persisted coordinates and add tests for generated UI, hidden placeholders, and structural whitespace.

- [ ] 🟡 **Do not mark OpenSpec task checkboxes complete until the review for that task is approved** → **Promote to schema / skill**
  > **Why**: Task 5 checkboxes were marked complete before review uncovered a blocking coordinate mismatch, requiring rollback of task state.
  > **How to apply**: In `openspec-apply-change` or subagent-driven OpenSpec plans, update task checkboxes only after implementation verification and the relevant review loop approve the task.

- [ ] 📌 **Markdown AST utility imports should be direct dependencies, not hoisted transitive imports** → **Promote to memory**
  > **Why**: The first highlighter implementation relied on transitive mdast/micromark packages; review correctly flagged package-manager fragility.
  > **How to apply**: When app code imports a package directly, add it to `package.json` even if it is already present through another dependency.

- [ ] 📌 **Verify/retro artifact commit timing should be called out before apply starts** → **Promote to schema**
  > **Why**: The verify artifact requires committed implementation evidence, but normal agent commit rules require explicit user approval.
  > **How to apply**: In superpowers-bridge apply instructions, state up front that implementation, verify, retrospective, and archive may each require user-approved commits unless the user pre-authorizes them.
