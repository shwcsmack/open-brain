# Retrospective: wikipedia-full-article-add

> Written: 2026-05-25 (after verify passed)
> Commit range: `7ed54a0466ee0bce44156f4d2e2354d4c3133012..7ed54a0466ee0bce44156f4d2e2354d4c3133012`
> Worktree: `/Users/shayne/code/open-brain/.worktrees/wikipedia-full-article-add`

---

## 0. Evidence

- **Commit range**: `7ed54a0466ee0bce44156f4d2e2354d4c3133012..7ed54a0466ee0bce44156f4d2e2354d4c3133012` (0 commits; work remains uncommitted per user instructions)
- **Diff size**: +632 / -31 lines across 10 files, including untracked OpenSpec artifacts and `open-brain/app/reading/add/__tests__/page.test.ts`
- **Tasks done**: 5/5 (`openspec instructions apply --change "wikipedia-full-article-add" --json` reported progress 5/5)
- **Active hours**: ~0.4 hours
- **Subagent dispatches**: 14 implementation/review/fix dispatches
- **New external dependencies**: none
- **Bugs encountered post-merge**: none; not merged
- **OpenSpec validate state at archive**: pass (`openspec validate wikipedia-full-article-add --strict`)
- **Test coverage signal**: `npm test` passed 9 Jest suites / 107 Jest tests plus 74 `tsx --test` tests; `npx tsc --noEmit` exited 0

Commit chain:

```
7ed54a0 docs(archive): archive reading-queue-improvements change
```

---

## 1. Wins

- The implementation stayed inside the planned frontend surface: `open-brain/app/reading/add/page.tsx` handles auto-add, loading phases, and button copy without backend or database changes.
- Review caught a real race before completion: the final review identified submit/clear behavior while `addWikipedia.isPending`, and the implementation added `isUrlFlowBusy` plus tests before `verify.md` was written.
- Verification was evidence-backed: `verify.md` records passing `npm test`, passing `npx tsc --noEmit`, final review status, and OpenSpec progress 5/5.

## 2. Misses

- 🟡 **painful**: The fresh worktree test baseline initially failed because the generated Prisma client was absent. `npx prisma generate` was required before `npm test` could pass.
- 🟡 **painful**: The first implementation of Task 1 handled the happy path but left failed-save retry state stuck until review forced `addWikipedia.reset()` on clear/new submit.
- 🟡 **painful**: The first final review found in-flight submit/clear races after all planned tasks were checked complete, requiring an extra fix loop.
- 📌 **nit**: The UI tests are source-shape regression tests. They pin important invariants but do not exercise rendered tRPC behavior.

## 3. Plan deviations

| Plan task | What changed | Why |
|-----------|--------------|-----|
| Task 1 | Added `addWikipedia.reset()` on clear and new submit | Review found failed save left the mutation non-idle, preventing retry after the manual confirm button was removed |
| Task 1-3 | Added `open-brain/app/reading/add/__tests__/page.test.ts` | The plan only called for typecheck/browser smoke testing, but TDD required a regression signal before production edits |
| Final verification | Added `isUrlFlowBusy` and disabled URL controls during fetch/save | Final review found duplicate-save and clear-while-save races not covered by the original plan |
| Task 3 smoke test | Did not run a browser dev-server smoke test | Automated tests and typecheck passed; the work was completed in a CLI-only apply flow without launching a long-running dev server |

## 4. Skill / workflow compliance

| Skill | Used |
|---|---|
| superpowers:brainstorming | ✓ |
| superpowers:writing-plans | ✓ |
| superpowers:using-git-worktrees | ✓ |
| superpowers:subagent-driven-development | ✓ |
| (transitive) superpowers:test-driven-development | ✓ |
| (transitive) superpowers:requesting-code-review | ✓ |
| superpowers:finishing-a-development-branch | ✗ |

### Deliberately Skipped Skills

- **`superpowers:finishing-a-development-branch`**
  - **What was skipped**: The final branch-completion menu and merge/PR decision flow.
  - **Why this cycle**: The current invocation was `/opsx-continue` to create exactly one ready artifact, `retrospective.md`. The schema's apply instructions place `finishing-a-development-branch` after retrospective and archive, but this cycle has not archived yet; `openspec status --change "wikipedia-full-article-add" --json` still reports `isComplete: false` until retrospective exists and archive runs.
  - **How to prevent recurrence**: `one-off - schema boundary case, no prevention possible`. This is not a skill failure during apply; the skill belongs after archive/PR readiness, while this retrospective is an intermediate artifact creation step.

## 5. Surprises

- The worktree root contains the repository wrapper, with the app under `open-brain/`; an initial direct read of `package.json` at the worktree root failed.
- `npm test` in a fresh worktree required `npx prisma generate` because `lib/generated/prisma` is gitignored.
- The small UI change had more race surface than the plan implied: removing the manual button made mutation state recovery and in-flight control disabling more important.
- OpenSpec artifacts were untracked in the original checkout, so they had to be copied into the isolated worktree before implementation could update `tasks.md` and write `verify.md`.

## 6. Promote candidates -> long-term learning

- [ ] 🟡 **Fresh worktrees need generated-client setup before baseline tests** -> **Promote to project CLAUDE.md**
  > **Why**: `npm test` failed until `npx prisma generate` produced `open-brain/lib/generated/prisma`, which is intentionally gitignored.
  > **How to apply**: When testing this repo in a fresh checkout or worktree, run `npx prisma generate` from `open-brain/` before `npm test`.

- [ ] 🟡 **Removing a manual recovery action requires mutation-state recovery review** -> **Promote to memory**
  > **Why**: Removing the Wikipedia confirm button made `addWikipedia.isIdle` recovery important; review caught that failed saves could otherwise strand the flow.
  > **How to apply**: When replacing a manual mutation trigger with an automatic effect, verify error/reset paths and retries before marking the task complete.

- [ ] 🟡 **Auto-save UI flows should disable controls during in-flight mutations** -> **Promote to memory**
  > **Why**: The final review found duplicate-save and clear-while-save races because submit and Clear stayed interactive while `addWikipedia.isPending`.
  > **How to apply**: For auto-submit or auto-save flows, add a single busy predicate and use it in submit handlers and related controls before final verification.

- [ ] 📌 **Source-shape tests are acceptable as a stopgap, not behavioral proof** -> **Promote to one-off**
  > **Why**: The added tests pinned invariants without introducing a new jsdom/tRPC harness, which was proportional for this small UI change.
  > **How to apply**: Use source-shape tests only when the repo lacks component test infrastructure and the change is narrow; prefer behavioral tests once a harness exists.
