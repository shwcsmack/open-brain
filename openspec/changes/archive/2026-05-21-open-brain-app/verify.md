# Verification Report: open-brain-app

**Schema**: superpowers-bridge  
**Verified**: 2026-05-20

---

## Summary

| Dimension    | Status                                    |
|--------------|-------------------------------------------|
| Completeness | 111/111 tasks ✅ · 1 requirement gap ❌    |
| Correctness  | 45/46 scenarios covered · 2 divergences ⚠️ |
| Coherence    | Architecture followed · design.md adhered |

---

## CRITICAL — Must Fix Before Archive

### 1. Standalone card creation form missing from `/decks`

**Spec**: `specs/flashcard-system/spec.md` — Requirement: "Standalone card creation"

> The system SHALL allow the user to create a flashcard with no source note via a form on `/decks`, accepting type (BASIC | CLOZE), front, back (optional for CLOZE), and deck selection.

**Finding**: `app/decks/page.tsx` contains only deck management controls (create deck, rename, delete). There is no card creation form or `CardCreationModal` present anywhere on this page.

**Recommendation**: Add a `<CardCreationModal>` button to `app/decks/page.tsx` — "New Card" button that opens the existing `CardCreationModal` component with `noteId` omitted (standalone card). The `CardCreationModal` already supports `noteId?: string` so only the trigger needs to be added.

---

## WARNING — Should Fix

### 2. Dialect abstraction requirement not implemented

**Spec**: `specs/full-text-search/spec.md` — Requirement: "Dialect abstraction"

> The system SHALL use SQLite FTS5 when `DATABASE_URL` points to a SQLite file and PostgreSQL `tsvector` when it points to a Postgres instance.

**Scenario not covered**: "Postgres tsvector search — WHEN the app runs with a Postgres database THEN `search.query` returns results using tsvector ranking"

**Finding**: The Postgres branch was removed from `lib/search.ts` (correctly, since `lib/prisma.ts` hardcodes the SQLite adapter). The README now documents "Postgres support is not currently implemented." The spec requirement is unmet, though the gap is acknowledged in docs.

**Recommendation**: Either (a) implement adapter selection in `lib/prisma.ts` based on `DATABASE_URL` scheme and restore the Postgres search path, or (b) update the spec to reflect the SQLite-only design decision. Option (b) is lower risk for a v1.

### 3. "All due cards" URL diverges from spec scenario

**Spec**: `specs/flashcard-system/spec.md` — Requirement: "Review hub"

> WHEN the user clicks "All due cards" THEN they are navigated to `/review/session?deck=all`

**Finding**: `app/review/page.tsx` navigates to `/review/session` (no query param). Per-deck rows correctly use `?deckId=<id>`. The session page interprets absent `deckId` as "all cards", which is functionally correct — but the spec scenario specifies `?deck=all` explicitly.

**Recommendation**: Either change the link to `/review/session?deckId=all` and handle `deckId === 'all'` as a sentinel in `review.listDue`, or update the spec scenario to match the current `deckId`-absent convention. The current behavior is correct; only the URL form differs.

---

## SUGGESTION — Nice to Fix

### 4. Login page has no link to `/setup` for fresh installs

**Spec**: `specs/self-hosting/spec.md` — "First boot redirects to setup"

The middleware redirects `/` to `/setup` when no user exists, but a user who manually navigates to `/login` on a fresh install sees an "Invalid password" error with no guidance. Adding a check + link ("First time? Set up your account →") would improve the first-run experience.

**File**: `app/login/page.tsx` — add `trpc.auth.hasUser.useQuery()` and conditionally render a setup link.

### 5. Cloze scenario description in spec has inverted example

**Spec**: `specs/flashcard-system/spec.md` — Scenario: "Cloze sibling blanks rendered"

> WHEN a cloze card with `{{c1::A}} and {{c2::B}}` is shown testing clozeIndex 1  
> THEN the card displays "A and [...]"

The implementation correctly shows `[...] and B` when testing c1 (c1 blank → `[...]`, c2 reveals answer B). The spec scenario has the output reversed — it would describe testing c2, not c1. The implementation is correct; the spec example should be updated to `[...] and B`.

**File**: `openspec/changes/open-brain-app/specs/flashcard-system/spec.md` — correct scenario output.

---

## Coherence

Design adherence was checked against `design.md` key decisions:

| Decision | Status |
|---|---|
| tRPC v11 + React Query for data fetching | ✅ Consistent throughout |
| Prisma 7 with better-sqlite3 driver adapter | ✅ Consistent |
| iron-session v8+ with `cookies()` App Router pattern | ✅ Consistent |
| Tiptap v2 custom extensions (Wikilink, TaskItem, Cloze) | ✅ Consistent |
| FSRS v5 via ts-fsrs `f.next()` API | ✅ Consistent |
| FTS5 applied on boot via `lib/startup.ts` | ✅ Implemented |
| Single-user, no `userId` scoping | ✅ Consistent |
| shadcn/ui Base UI (not Radix, no `asChild`) | ✅ Consistent |

Code patterns (file naming, directory structure, router conventions) are consistent across all 13 task groups.

---

## Final Assessment

**1 critical issue** found. Fix before archiving:

- Add standalone card creation button/modal to `app/decks/page.tsx` (5-minute fix — `CardCreationModal` already exists).

2 warnings are acceptable divergences: the Postgres path was an intentional scope reduction (documented in README), and the `/review/session` URL difference is functionally correct.
