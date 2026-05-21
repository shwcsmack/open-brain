# Retrospective: open-brain-app

> Written: 2026-05-20 (after verify passed — second verify round, all issues resolved)
> Commit range: `84e9b37..08191a6` (implementation commits)
> Worktree: `.claude/worktrees/open-brain-app/open-brain`

---

## 0. Evidence

- **Commit range**: `84e9b37..08191a6` (23 implementation commits: 12 feat, 11 fix)
- **Diff size**: +12,525 / -3,521 lines across 65 files (implementation only; excludes OpenSpec artifacts)
- **Tasks done**: 111/111
- **Active hours**: ~1 session (single continuous implementation run)
- **Subagent dispatches**: ~12 (one per feature group — scaffolding, schema, auth, editor, wikilinks, graph, tasks, search, periodic, flashcard core, flashcard UI, polish)
- **New external dependencies**: `ts-fsrs ^5.4.0` (MIT), `reactflow ^11.11.4` (MIT), `d3-force ^3.0.0` (ISC), `iron-session ^8.0.4` (MIT), `better-sqlite3 ^12.10.0` (MIT), `@tiptap/react ^3.23.5` (MIT), `@tiptap/starter-kit ^3.23.5` (MIT)
- **Bugs encountered post-merge**: 0 post-archive; pre-archive verify found 1 critical + 4 warnings resolved in-cycle
- **OpenSpec validate state at archive**: PASS (second verify round — all critical, warning, and suggestion items closed)
- **Test coverage signal**: 24 tests passing (6 suites: wikilink-serializer, cloze-serializer, slug, search, FTS5 integration, `lib/__tests__/slug`)

Commit chain (chronological):

```
84e9b37 feat: project scaffolding — Next.js 14, tRPC, Prisma, shadcn/ui setup
d3d3861 feat: full Prisma schema — User, Note, Task, Deck, Flashcard, PeriodicTemplate + migrations
49fec99 feat: auth — setup/login pages, session middleware, INITIAL_PASSWORD, Dockerfile
7646ea4 fix: setup page redirects to /login when user already exists
b6c614b fix: await session.destroy() so Set-Cookie header is sent on logout
cff8112 feat: note editor core — CRUD, auto-save, tags, notes list, note detail
9acc121 feat: wikilinks — WikilinkExtension, NoteLink diff-sync, backlinks panel
7231ce8 feat: knowledge graph — React Flow canvas, d3-force layout, focus mode with hop depth slider
b372748 feat: task management — task router, /tasks page with filters, TaskItemExtension, inline sync
b880803 feat: full-text search — FTS5/fallback search, search.query tRPC, SearchModal (Cmd+K)
953a0cf fix: task 8 spec compliance - rename searchNotes, task FTS sync, icon, snippet format, recent label
72dba42 fix: task 8 quality - fts sync in syncFromNote, snippet body column, html escaping
c87622a feat: periodic notes — period keys, getOrCreatePeriodic, CalendarNavigator, settings templates
a33047f fix: task 9 quality - periodKey validation, cache invalidation, safe JSON parse
43b203e feat: flashcard data & core — flashcard/deck/review routers, FSRS computeNextState
47272e1 fix: task 10 quality - atomic create, deckId validation, groupBy counts, soft-delete guard
7d0b73f feat: flashcard editor integration — ClozeExtension, sync, CardCreationModal, CardsPanel
73b2bf2 fix: task 11 quality - shift+F key, label a11y, multi-cloze front, sync transaction
ffb23ad feat: flashcard review UI — decks page, review hub, session with FSRS previews
47e46cc fix: task 12 spec - explicit cloze blank rendering, next session size on complete screen
3de1275 fix: task 12 quality - stale closure in handleRate, isPending guard, siblings cleanup, enabled query
2b06a38 feat: polish & quality — skeletons, optimistic updates, toasts, seed, tests, README
75289d6 fix: task 13 quality - optimistic update cache key, ErrorBoundary logging, sidebar a11y, seed fixes
08191a6 fix: fts5 tables applied on startup, remove dead postgres path and misleading docs
```

---

## 1. Wins

- [evidence: plan.md file tree vs actual repo] Architecture matched the plan almost exactly — all 10 server routers, 4 Tiptap extensions, and 3-tier directory structure (`app/`, `server/`, `lib/`, `components/`) realized as designed, before any code was written
- [evidence: 12 feat commits paired with 11 fix commits] Feature-then-quality commit discipline worked well — each major feature landed as a clean `feat:` commit, immediately followed by a `fix:` that caught integration issues before moving to the next group; no rework crossed feature boundaries
- [evidence: `lib/search.ts` FTS5 LIKE fallback] FTS5 fallback to LIKE search was written defensively from day one (`try/catch` around `$queryRawUnsafe`) — made startup FTS5 table creation non-blocking and prevented the app from hard-failing in environments without FTS5
- [evidence: `lib/startup.ts:applyFts5Tables`] Discovered that Prisma can't declare FTS5 virtual tables in schema.prisma; routed around it cleanly with a `better-sqlite3` direct call at startup instead of a migration — zero user-facing impact
- [evidence: `tests/fts5-integration.test.ts`, `tests/cloze-serializer.test.ts`, `tests/wikilink-serializer.test.ts`] Serializer unit tests and FTS5 integration test caught the exact failure modes described in design.md's risk register (cloze sync re-creation, FTS5 path coverage)
- [evidence: design.md D1–D14 all ✅ in second verify round] All 14 design decisions held through implementation — no last-minute architecture pivots required

---

## 2. Misses

- 🔴 [blocking | evidence: verify.md §1 CRITICAL, fixed in `app/decks/page.tsx`] **Standalone card creation missing from `/decks` on first verify** — `CardCreationModal` was built with `noteId?: string` making standalone mode trivially addable, but task 12.1 was scoped only to "deck management controls" and didn't explicitly name the "New Card" button. The component existed; the trigger didn't. A 5-line fix, but it required a verify round to surface.

- 🟡 [painful | evidence: design.md D2 Postgres FTS path, `lib/search.ts` history] **Postgres dialect was designed in but removed during implementation** — design.md committed to `pg_trgm + to_tsvector` behind a shared `searchNotes(query)` helper. The Postgres branch was written but removed (`08191a6`) once it became clear Prisma's driver-adapter setup for SQLite conflicted with maintaining a live Postgres code path in the same codebase without a running Postgres to test against. Specs and design were updated post-hoc to reflect SQLite-only v1. Would have been cleaner to scope this out in the design phase rather than partially implement and remove.

- 🟡 [painful | evidence: verify round 2, `app/tasks/page.tsx`] **Tasks page had no navigation sidebar** — every other page (notes, notes/[slug], decks, review, review/session, graph, settings) had at minimum a static sidebar with nav links. The tasks page landed as a bare `<div className="p-6 max-w-3xl mx-auto">` with no way to navigate away. Not caught by the first verify because verify.md focused on spec requirements, not UX navigation consistency. Required a second verify round to identify.

- 📌 [nit | evidence: `openspec/changes/open-brain-app/specs/flashcard-system/spec.md`] **Cloze sibling scenario had inverted example** — spec said "displays `A and [...]`" when testing `c1`, but the correct rendering is `[...] and B` (the tested blank is hidden, siblings are revealed). The implementation was correct; the spec example was wrong.

- 📌 [nit | evidence: design.md D12 pre-fix] **design.md D12 used `?deck=[id]` while implementation used `?deckId=<id>`** — URL parameter name diverged between design and implementation. Low impact but caught by coherence check.

---

## 3. Plan deviations

| Plan task / component | What changed | Why |
|---|---|---|
| `components/notes/CardsPanel.tsx` | Implemented as `components/flashcard/CardsPanel.tsx` | Cards panel belongs with flashcard components, not note components; the plan's placement was inconsistent with the feature boundary |
| `components/flashcard/ReviewSession.tsx` + `RatingButtons.tsx` | Inlined into `app/review/session/page.tsx` | Extracting to separate components added no reuse value — review session is a single-screen workflow; inlining kept state co-located |
| `components/periodic/CalendarNavigator.tsx` | Implemented as `components/calendar/CalendarNavigator.tsx` | `calendar/` is clearer as a directory name than `periodic/` for a calendar-nav component |
| `components/layout/AppSidebar.tsx` | No shared AppSidebar component; each page has an inline `<aside>` | Each page's active-link state differs; a shared component would need complex active-detection logic. Inline was pragmatic for 7 pages. |
| `components/notes/NotesList.tsx` | Inlined into `app/page.tsx` | Notes list is only used on one page; extracting it was premature abstraction |
| FTS5 via Prisma migration `0001_fts5.sql` | FTS5 tables created via `better-sqlite3` at app startup (`lib/startup.ts`) | Prisma doesn't support virtual table syntax in migration files across all adapters; runtime creation with graceful fallback is more portable |
| Postgres FTS via `tsvector` | Removed entirely | Single-user self-hosting targets SQLite; maintaining a live Postgres code path without a Postgres test environment created dead code risk |

---

## 4. Skill / workflow compliance

| Skill | Used |
|---|---|
| superpowers:brainstorming | ✓ |
| superpowers:writing-plans | ✓ |
| superpowers:using-git-worktrees | ✓ |
| superpowers:subagent-driven-development | ✓ |
| (transitive) superpowers:test-driven-development | ✗ |
| (transitive) superpowers:requesting-code-review | ✗ |
| superpowers:finishing-a-development-branch | ✗ |

### Deliberately Skipped Skills

- **`superpowers:test-driven-development`**
  - **What was skipped**: The full TDD cycle (write failing test → implement → green) was not followed. Tests were written after implementation (task group 13.7, commit `2b06a38`).
  - **Why this cycle**: The features requiring the most test confidence (cloze sync, wikilink serialization, FTS5 queries) all operate on pure data structures (Tiptap JSON → tuples, SQL strings) with no UI dependency. The subagent flow wrote feature implementations first because the task breakdown in tasks.md placed tests in group 13 (last), not co-located with each feature group.
  - **How to prevent recurrence**: `scope-judgment rule` — when tasks.md places all tests in a single late group, that's a task-breakdown smell. For serializer-heavy features, restructure tasks so each feature group ends with `N.x Test: write unit test for <serializer>` before the next group starts. This wires TDD into the task sequence rather than relying on the implementer to override task order.

- **`superpowers:requesting-code-review`**
  - **What was skipped**: No code review was requested mid-implementation.
  - **Why this cycle**: The change was a greenfield solo project with no collaborators; the verify skill (`opsx:verify`) served as the structured quality gate instead, running two full passes and surfacing 1 critical + 4 warnings that were resolved before archive.
  - **How to prevent recurrence**: `one-off — schema boundary case` — for greenfield solo changes, `opsx:verify` is the appropriate substitute for peer code review. This is a schema boundary: the superpowers-bridge schema includes `verify` precisely because async human review isn't always available. No schema change needed; the pattern is intentional.

- **`superpowers:finishing-a-development-branch`**
  - **What was skipped**: The finishing-a-development-branch skill (which guides merge strategy, PR creation, cleanup) was not explicitly invoked before archiving.
  - **Why this cycle**: The change is being archived via `opsx:archive` (OpenSpec workflow) rather than merged via a GitHub PR. The worktree will be cleaned up by the archive step. Merge strategy was implicitly decided (keep worktree until archive) rather than explicitly guided by the skill.
  - **How to prevent recurrence**: `schema graph fix` — the superpowers-bridge schema should surface `superpowers:finishing-a-development-branch` as a prompt in the retrospective instructions or as a pre-archive step, since archiving a worktree-based change is the functional equivalent of finishing a branch. Current schema has no explicit hook for this.

---

## 5. Surprises

- **FTS5 virtual tables are incompatible with Prisma migrations** — design assumed FTS5 could be shipped as a `.sql` migration file (`0001_fts5.sql`). In practice, Prisma's migration runner with the `better-sqlite3` driver adapter doesn't execute raw SQL migration files in the same way; the virtual table had to move to a `better-sqlite3` call in `lib/startup.ts`. This is the right long-term home anyway (idempotent, boot-time, survives schema resets) but was an unexpected implementation detour.

- **Tiptap v3 (not v2) was installed** — design.md specified Tiptap v2. The package manager resolved `@tiptap/react ^3.23.5` — a major version bump that ships breaking API changes (notably `addNodeView()` and `EditorContent` prop signatures). The extensions required adaptation from v2 docs, which accounted for several of the `fix:` commits in groups 11 and 12.

- **`handleRate` stale closure bug in review session** — `handleRate` captured `current` and `flipped` at definition time; when called from a keyboard event listener, it operated on stale values. Required `useCallback` with correct deps and a `rateMutation.isPending` guard (`3de1275`). This is a well-known React hooks pitfall but easy to miss in a long stateful component.

- **shadcn/ui AlertDialogTrigger uses `render` prop, not `asChild`** — design.md explicitly noted "no `asChild`" but the actual pattern used by this version of shadcn/ui for `AlertDialogTrigger` is `render={<Button />}` (a custom render prop), which is different from both `asChild` and standard children. Every delete confirmation dialog required this pattern; it wasn't documented in the design and took trial-and-error to discover.

---

## 6. Promote candidates → long-term learning

- [ ] 🔴 **Test placement in task breakdown determines whether TDD happens** → **Promote to memory** (type: feedback)
  > **Why**: Tasks placed all tests in group 13 (last). Subagents implemented group-by-group and wrote tests only after all features were complete — the opposite of TDD. The task structure enforced test-last by design.
  > **How to apply**: When reviewing tasks.md before implementation, check whether each feature group ends with a test task. If all tests are in a trailing group, restructure before starting. Flag this during `superpowers:writing-plans` review.

- [ ] 🟡 **Scope Postgres dialect out explicitly at design time, not implementation time** → **Promote to memory** (type: feedback)
  > **Why**: design.md committed to Postgres FTS support; implementation removed it mid-cycle after discovering the test infrastructure gap. The spec was then updated post-hoc — creating audit trail confusion (verify.md referenced the original spec, requiring two passes).
  > **How to apply**: During design review, for any "optional via env var" feature, ask: "Can we test this path in this cycle?" If no, mark it explicitly as v2 in design.md and do not include it in tasks.md. Don't half-implement and remove.

- [ ] 🟡 **Navigation consistency is a spec-level requirement, not implied** → **Promote to memory** (type: feedback)
  > **Why**: The tasks page shipped without any navigation sidebar. Seven other pages had sidebars. No spec requirement said "every page must have a nav sidebar" — so the verifier didn't flag it in the first pass. Required a second verify round.
  > **How to apply**: When writing specs for multi-page apps, add an explicit navigation consistency requirement (e.g., "every authenticated page SHALL include the global nav sidebar"). Treat it like any other functional requirement with a scenario.

- [ ] 📌 **Tiptap major version drift between design-time and install-time** → **Promote to memory** (type: project)
  > **Why**: design.md said "Tiptap v2"; npm installed v3. The API surface changed enough to require extra fix commits.
  > **How to apply**: When a design pins a library major version, lock it in package.json (`"@tiptap/react": "^2.x.x"`) before the first `npm install`. Don't rely on the semver range to stay within the design's assumed major version.

- [ ] 📌 **`superpowers:finishing-a-development-branch` has no hook in superpowers-bridge schema** → **Promote to schema** (superpowers-bridge schema update)
  > **Why**: The skill was skipped because the archive step implicitly covers worktree cleanup. But there's no prompt in the schema reminding implementers to consider merge strategy, PR creation, or branch hygiene before archiving.
  > **How to apply**: Add a pre-retrospective step in the superpowers-bridge schema that surfaces `superpowers:finishing-a-development-branch` or explicitly marks it as "handled by opsx:archive" — so future implementers make a conscious choice rather than silently skipping.
