# Retrospective: reading-queue-improvements

> Written: 2026-05-24 (after verify passed with warnings)
> Commit range: `5692c67..b7a7980`
> Worktree: `/Users/shayne/code/open-brain/.worktrees/reading-queue-improvements`

---

## 0. Evidence

- **Commit range**: `5692c67..b7a7980` (8 commits)
- **Diff size**: committed artifact history: `+2998 / -0` across 12 files; uncommitted tracked implementation diff at verify time: `+2162 / -354` across 13 tracked files, plus untracked route/migration/verify artifacts
- **Tasks done**: 66/66 (`tasks.md`)
- **Active hours**: approximately one extended implementation session
- **Subagent dispatches**: multiple implementation and review dispatches across all 16 task groups; exact count not reliably reconstructable from git history alone
- **New external dependencies**: none
- **Bugs encountered post-merge**: none; not merged
- **OpenSpec validate state at archive**: pass at verify time (`13 items checked: 13 passed, 0 failed`)
- **Test coverage signal**: `npm test` passed (`8` Jest suites, `98` Jest assertions, plus `74` `node:test` tests); `npx tsc --noEmit` passed; `npm run build` blocked by environment first, then by unrelated `/review/session` Suspense-boundary issue with a dummy `SESSION_SECRET`

Commit chain (chronological):

```text
5b7e6e1 docs(brainstorm): reading-queue-improvements brainstorm
9309229 docs(proposal): reading-queue-improvements proposal
04e2216 docs(design): reading-queue-improvements technical design
09e995d docs: rename WIKIPEDIA_SECTION to WIKIPEDIA — in-scope for this change
ffdeb9e docs: delete existing WIKIPEDIA_SECTION rows in migration — stale fragments
966e7e1 docs(specs): reading-queue-improvements — 4 new capabilities, 3 delta specs
3320ab8 docs(tasks): reading-queue-improvements task breakdown
b7a7980 docs(plan): reading-queue-improvements implementation plan
```

---

## 1. Wins

- The artifact chain gave the implementation a stable target: brainstorm decisions, design decisions, specs, and tasks all converge on the same feature set: archive/delete, passage tombstones, whole-article Wikipedia import, push-to-front session navigation, detail pages, and archive log.
- TDD caught core data behavior early. The final `tests/reading.test.ts` coverage includes archive/unarchive/delete, hidden-passage JSON mutation, duplicate Wikipedia URL preference rules, single-item Wikipedia import, and merged Wikipedia fetching.
- The two-pass task review loop surfaced issues that would be easy to miss in a large UI change: deleted-item guards, malformed `hiddenPassages` JSON, duplicate article URL tie-breaking, stale `startFrom` responses, double-advance races, optimistic rollback corruption, and accessibility gaps.
- Verification stayed evidence-based: `openspec validate --all --json`, `npm test`, and `npx tsc --noEmit` all passed, while `npm run build` clearly isolated the remaining blocker to `/review/session`, outside this change surface.

## 2. Misses

- 🟡 [painful | evidence: `verify.md` §5] Implementation work remains uncommitted even though the plan included commit steps per task. This makes the final diff harder to audit and prevents the implementation signal from being green.
- 🟡 [painful | evidence: `verify.md` §3] Delta specs were not synced into main specs before retrospective, so archive is not yet clean even though apply tasks are complete.
- 🟡 [painful | evidence: `npm run build`] The production build could not serve as a clean integration gate because it first required `SESSION_SECRET`, then hit an unrelated `/review/session` Suspense-boundary failure.
- 📌 [nit | evidence: `git status --short` hang observed during verify] Plain `git status --short` hung in this worktree once; using targeted `git diff --name-only HEAD` and `git ls-files --others --exclude-standard` produced usable evidence.

## 3. Plan deviations

| Plan task | What changed | Why |
|-----------|--------------|-----|
| Task 2 | Single-item archive/unarchive/delete gained explicit `deletedAt`/missing-row guards and consistent `NOT_FOUND` mapping | Review found Prisma errors and soft-deleted rows would otherwise behave inconsistently |
| Task 3 | `hiddenPassages` JSON parsing gained validation and `BAD_REQUEST` behavior for malformed/non-array values | Review found unguarded `JSON.parse` could leak runtime exceptions and corrupt mutation paths |
| Task 4 | `getImportedWikipediaUrls` added deterministic duplicate URL preference rules | Review found last-write-wins behavior was not a stable product rule |
| Task 8 | Queue row click behavior was refactored around explicit navigation buttons and sibling controls | Accessibility and event-propagation review found nested interactive controls and delete-confirm navigation risk |
| Task 9 | Session actions gained shared locking and generation guards | `startFrom`, archive/delete, and advance flows could otherwise race and skip items |
| Task 10 | Tombstone range handling and Wikipedia URL lookup normalization were expanded beyond the initial plan | Overlapping hidden passages and URL variants created correctness gaps between rendered pill state and click behavior |
| Task 11 | Restore was batched for grouped tombstones and rollback became item-scoped | Optimistic restore/hide rollback could affect a newly advanced item |
| Task 12 | Wikipedia push-to-front now shares lookup helpers and checks session action locks before pushing | Separate normalization and concurrent actions could corrupt queue state |
| Task 14 | Missing article detail items now use `notFound()` and a route-level `not-found.tsx` | Spec expected a 404 page, not an inline missing state |
| Task 15 | Archive page added explicit query error UI and mobile nav parity | Review found filtered-empty and failure states were underspecified |

## 4. Skill / workflow compliance

| Skill                                            | Used |
|--------------------------------------------------|------|
| superpowers:brainstorming                        | ✓ |
| superpowers:writing-plans                        | ✓ |
| superpowers:using-git-worktrees                  | ✓ |
| superpowers:subagent-driven-development          | ✓ |
| (transitive) superpowers:test-driven-development | ✓ |
| (transitive) superpowers:requesting-code-review  | ✓ |
| superpowers:finishing-a-development-branch       | ✗ |

### Deliberately Skipped Skills

- **`superpowers:finishing-a-development-branch`**
  - **What was skipped**: The final branch integration step that decides commit/PR/archive handoff after implementation verification.
  - **Why this cycle**: `verify.md` §5 records PASS WITH WARNINGS because implementation changes are still uncommitted and delta specs still need sync; running a finishing branch workflow before those are resolved would produce misleading readiness signals.
  - **How to prevent recurrence**: `schema graph fix` — move `finishing-a-development-branch` out of retrospective compliance expectations, or add a schema state between `retrospective` and `archive` that explicitly runs finishing only after commit and spec-sync checks are green.

## 5. Surprises

- The `SESSION_SECRET` requirement masked the real build blocker until a dummy 32-character value was supplied.
- Build reached an unrelated App Router error in `/review/session`; this means a reading-queue PR can be correct but still unable to use `npm run build` as a binary pass/fail gate until that page is fixed.
- The most subtle implementation risks were not in the database migration; they were in client session state: stale `startFrom` fetches, shared `advance()` calls, and optimistic rollback after the current item changed.
- `getImportedWikipediaUrls` needed an explicit duplicate policy. The spec said to return a map, but real data can contain duplicate `articleUrl` rows when active and archived imports coexist.

## 6. Promote candidates → long-term learning

- [ ] 🟡 **Treat build env failures as two-step gates** → **Promote to memory**
  > **Why**: `npm run build` first failed on missing `SESSION_SECRET`; rerunning with a dummy secret exposed the real `/review/session` Suspense-boundary blocker.
  > **How to apply**: When a build fails on required local env, rerun with safe dummy values before concluding the code under test is blocked only by environment setup.

- [ ] 🟡 **Spec sync should happen before retrospective or be modeled as a separate artifact** → **Promote to schema**
  > **Why**: `verify.md` had to mark all seven delta spec capabilities as needing sync, leaving archive not clean even after apply and verify completed.
  > **How to apply**: In OpenSpec schemas with delta specs, require a sync artifact or explicit sync decision before retrospective/finish readiness.

- [ ] 🟡 **Do not require finishing-a-development-branch inside retrospective compliance** → **Promote to schema**
  > **Why**: This schema asks retrospective to report finishing compliance, but retrospective can be ready while implementation remains uncommitted and specs unsynced.
  > **How to apply**: Treat finishing as a post-retrospective or post-sync integration phase, not a skill expected to be complete before retrospective exists.

- [ ] 📌 **Use targeted git evidence when `git status` hangs** → **Promote to memory**
  > **Why**: `git status --short` hung in the worktree, while `git diff --name-only HEAD` and `git ls-files --others --exclude-standard` returned promptly.
  > **How to apply**: When status hangs during verification, switch to targeted diff/untracked commands to avoid blocking the workflow.
