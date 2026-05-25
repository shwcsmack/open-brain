# Retrospective: passage-selection-deletion

> Written: 2026-05-25 (after verify passed)
> Commit range: `35eedc2..e723395`
> Worktree: `/Users/shayne/code/open-brain/.worktrees/passage-selection-deletion`

---

## 0. Evidence

- **Commit range**: `35eedc2..e723395` (2 commits)
- **Diff size**: +693 / -6 lines across 11 files
- **Tasks done**: 6/6 (`tasks.md`)
- **Active hours**: ~0.3 hours
- **Subagent dispatches**: 11 (implementation, review, and fix/re-review agents)
- **New external dependencies**: none
- **Bugs encountered post-merge**: none; not merged yet
- **OpenSpec validate state at archive**: pass before archive (`openspec validate --all --json`: 17/17 valid)
- **Test coverage signal**: `npm test -- --runInBand` passed (10 Jest suites, 115 Jest tests; 74 node tests); `npx tsc --noEmit` passed

Commit chain (chronological):

```text
c79afae fix(reading): improve passage selection deletion
e723395 docs(verify): record passage deletion verification
```

---

## 1. Wins

- The implementation stayed tightly scoped to `open-brain/components/reading/ExtractHighlighter.tsx`, with focused helper tests in `open-brain/tests/extractHighlighter.test.ts`.
- The cross-paragraph deletion bug got a red/green regression test: the focused Jest test failed before the `\s+` regex change and passed after it.
- The review loop improved the test quality before completion: the cross-paragraph test now asserts `restoreMap`, and the multi-passage test asserts untouched middle content survives.
- OpenSpec validation stayed clean after verify: all 17 items were valid, with only pre-existing info-level long-requirement notes on unrelated specs.

## 2. Misses

- 🟡 [painful] `verify.md` could not be produced until a commit existed; the apply flow originally paused because commit evidence was `0` even though code/tests were complete.
- 🟡 [painful] The change artifacts were untracked in the main checkout, so they were absent from the new worktree and had to be recreated there before apply could proceed.
- 📌 [nit] The File namespace behavior is covered by helper tests but not a ReactMarkdown render-layer test proving `File:` links produce plain anchors.
- 📌 [nit] The `select-text` fix was verified by TypeScript and code review, not by a browser drag-selection smoke test.

## 3. Plan deviations

| Plan task | What changed | Why |
|-----------|--------------|-----|
| Task 1 tests | Added Jest mocks for `react-markdown` and `remark-gfm` | Importing the client component pulls ESM dependencies that Jest does not transform in this setup. |
| Task 1 tests | Added stronger assertions than planned (`restoreMap`, middle content survives) | Code quality review identified cheap assertions that protect the function contract. |
| Task 3 smoke test | Browser smoke was not run | The plan listed it as manual verification, but the apply task checklist only required helper implementation, guard implementation, Jest, and TypeScript verification. |
| Verification | Added a separate verify commit | The schema precheck requires positive commit evidence before `verify.md` can be produced. |

## 4. Skill / workflow compliance

| Skill                                            | Used |
|--------------------------------------------------|------|
| superpowers:brainstorming                        | ✓ (artifact present) |
| superpowers:writing-plans                        | ✓ (plan artifact present) |
| superpowers:using-git-worktrees                  | ✓ |
| superpowers:subagent-driven-development          | ✓ |
| (transitive) superpowers:test-driven-development | ✓ |
| (transitive) superpowers:requesting-code-review  | ✓ |
| superpowers:finishing-a-development-branch       | N/A (post-retrospective/post-archive step) |

> **Default expectation**: all apply-phase skills are used. `finishing-a-development-branch`
> is sequenced after retrospective and archive in this schema, so it was not due at the
> time this retrospective was written.

### Deliberately Skipped Skills

None. The only not-yet-used skill is `superpowers:finishing-a-development-branch`, which is a later schema step rather than a skipped apply-phase step.

## 5. Surprises

- The isolated worktree did not contain the untracked OpenSpec change directory, so context artifacts had to be copied into the worktree before subagent-driven apply could start.
- The verify artifact has a stronger implementation-signal precheck than the usual "tests pass" gate: it requires commit evidence, which forced a commit before retrospective/archive.
- Importing a pure exported helper from a `'use client'` component in Jest still required mocking ReactMarkdown dependencies.

## 6. Promote candidates → long-term learning

- [ ] 🟡 **Create OpenSpec changes on a branch or committed artifact path before worktree apply** → **Promote to schema**
  > **Why**: Untracked change artifacts are not present in a new git worktree, which adds manual copying before implementation can start.
  > **How to apply**: When `superpowers-bridge` creates an isolated worktree, ensure the active change directory is committed, stashed/applied, or generated inside the target worktree before apply proceeds.

- [ ] 🟡 **Document verify commit-evidence timing before apply starts** → **Promote to skill**
  > **Why**: `verify.md` intentionally requires a positive commit count, but that can surprise agents following "do not commit unless asked" rules.
  > **How to apply**: Before apply begins on `superpowers-bridge`, surface that verify will pause until the user approves a commit or provides an alternate commit policy.

- [ ] 📌 **Prefer render-level tests when a helper controls renderer branching** → **Promote to one-off**
  > **Why**: `isWikipediaFileUrl` is tested, but the ReactMarkdown anchor branch is only verified by inspection.
  > **How to apply**: For future changes where a pure helper gates UI rendering, add one lightweight component/render test if the project test setup can support it without brittle mocks.
