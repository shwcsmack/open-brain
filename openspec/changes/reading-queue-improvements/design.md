## Context

The reading queue is a spaced-repetition system built on FSRS. `ReadingItem` rows hold article content and scheduling state. Items are surfaced in a session page that works through the due queue one item at a time.

Current gaps driving this change:
- No way to remove items from the queue (no delete, no archive)
- Sessions always start from the top of the due list; no item-level entry point
- Wikipedia links in article content have no import-state indicator and always trigger a new import
- Wikipedia import splits articles into per-section items via a section picker
- The text-selection toolbar has no "delete this passage" action
- No stable per-item URL; archived items cannot be referenced

The codebase is a Next.js app with tRPC for API calls and Prisma + SQLite for persistence. `ReadingItem` already has a `deletedAt` soft-delete field that is currently used as a permanent removal mechanism.

## Goals / Non-Goals

**Goals:**
- Add archive and hard-delete actions to the queue (per-item and bulk)
- Allow any queue item to be the starting point for a reading session
- Track Wikipedia import state visually (+ / ✓ pill) and push linked articles to the front of the in-session queue
- Import Wikipedia articles as one whole item (no section picker)
- Allow text passages to be soft-hidden with inline tombstones and per-passage restore
- Provide a stable `/reading/[id]` detail page for both active and archived items
- Provide a `/reading/archive` log page accessible from the sidebar

**Non-Goals:**
- Re-ordering the queue manually (drag-and-drop or priority editing)
- Collaborative or multi-user reading queues
- Full-text search within reading item content
- Syncing read state across devices
- Changing the FSRS scheduling algorithm

## Decisions

### D1: Archive and delete are distinct actions

- **Choice:** Add `archivedAt DateTime?` to `ReadingItem`. Hard delete sets `deletedAt`. `listDueItems` and `listAllItems` filter out both `deletedAt IS NOT NULL` and `archivedAt IS NOT NULL` from active views.
- **Reason:** Users want a recoverable log (especially for Wikipedia), but also the ability to permanently remove items. Collapsing both into one action loses either recoverability or the clean-slate option.
- **Alternatives considered:** Single `status` enum (`ACTIVE | ARCHIVED | DELETED`) — rejected because it complicates queries and makes null checks non-obvious. Reusing `deletedAt` for archive — rejected because it loses the semantic distinction and prevents showing archived items.

### D2: Hidden passages stored as JSON on ReadingItem

- **Choice:** `hiddenPassages String @default("[]")` on `ReadingItem`, containing a JSON array of passage strings. `hidePassage` appends; `restorePassage` removes by value match.
- **Reason:** Passages are short strings tied to a single item; a separate table would add a join for every article render with no query benefit at this scale.
- **Alternatives considered:** Separate `HiddenPassage` table — rejected as over-engineered for the use case. Modifying `content` in-place — rejected because it makes restore impossible without a separate snapshot.

### D3: Push-to-front is client-side only

- **Choice:** When a Wikipedia link is clicked in the session, the fetched/unarchived item is inserted at the front of the in-memory React queue state (`setCurrent(wikiItem); setQueue([currentItem, ...prev])`). No server-side queue ordering is changed.
- **Reason:** The session queue is ephemeral client state. Persisting queue order to the server would require a `position` field and an ordering API, which is out of scope. The push-to-front effect only needs to last for the current session.
- **Alternatives considered:** Persist priority boost to DB (temporarily raise `priority` to 999) — rejected because it would affect subsequent sessions and require cleanup. Dedicated `queuePosition` column — rejected as premature.

### D4: startFrom rotates, not filters

- **Choice:** `?startFrom=<id>` on the session page finds the target item in the due list and rotates the array so it is `current`. If the item is not due, it is prepended to the due list.
- **Reason:** The user wants to read that item next, not skip everything else. Rotation preserves the rest of the queue without changes to the DB.
- **Alternatives considered:** Only show the selected item (single-item session) — rejected because context continuity (knowing what's next) is part of the session UX.

### D5: Wikipedia import produces one item per article

- **Choice:** `fetchWikipediaForReading` concatenates all sections into a single string with `## Section Title` headings. `addWikipediaToQueue` accepts this as one item. The `ReadingSource` enum value `WIKIPEDIA_SECTION` is renamed to `WIKIPEDIA` in the same migration (Prisma `@map` + SQLite column value update).
- **Reason:** Per-section items fragment context. Users prefer to clean up articles progressively using the new delete-passage action. The section picker adds friction without benefit given delete-passage exists. Since all Wikipedia import code paths are being rewritten in this change, renaming the enum now costs nothing and keeps the data model semantically correct.
- **Alternatives considered:** Keep section picker as optional — rejected to avoid maintaining two code paths. Defer rename — rejected; this is the right moment since all callers are being updated anyway.

### D6: Wikipedia tracking via articleUrl query

- **Choice:** `getImportedWikipediaUrls` queries all `ReadingItem` rows where `articleUrl IS NOT NULL AND deletedAt IS NULL`, returns `Record<string, { id: string; archivedAt: Date | null }>`. The session page fetches this once on mount and passes the map to `ExtractHighlighter`.
- **Reason:** `articleUrl` is already populated by `addWikipediaToQueue`. No new tracking table needed. Hard delete removes the row; archive leaves it in the map (amber ✓).
- **Alternatives considered:** Separate `WikipediaImportLog` table — rejected as redundant given `articleUrl` already serves this purpose.

### D7: Detail page is a read-only view; session is the interaction surface

- **Choice:** `/reading/[id]` renders article content with tombstones and the right sidebar. It does not host rating controls. "Start reading from here" navigates to `/reading/session?startFrom=<id>`. Archived items show a Restore button.
- **Reason:** Keeps scheduling logic (FSRS rating) in one place (the session). The detail page is for browsing, not reviewing.
- **Alternatives considered:** Embed rating controls on detail page — rejected because it duplicates session logic and blurs the purpose of each view.

## Risks / Trade-offs

[Risk] JSON mutation for `hiddenPassages` is not atomic — two concurrent restores could race and corrupt the array → Mitigation: Single-user app (self-hosted); no concurrent writes in practice. If multi-user support is added later, migrate to a `HiddenPassage` table.

[Risk] `startFrom` prepends non-due items, which could cause an item to appear in a session before its scheduled due date → Mitigation: This is intentional — the user explicitly chose to read it. FSRS scheduling is only affected when the item is rated, not when it is viewed.

[Migration] Renaming `WIKIPEDIA_SECTION` → `WIKIPEDIA` in the `ReadingSource` enum requires a Prisma migration that updates existing rows. SQLite does not support `ALTER TYPE`, so the migration uses a raw `UPDATE ReadingItem SET sourceType = 'WIKIPEDIA' WHERE sourceType = 'WIKIPEDIA_SECTION'` statement after the schema change → Mitigation: Wrapped in the same migration file as the `archivedAt`/`hiddenPassages` additions; tested with the existing `reading.test.ts` suite.

[Trade-off] `getImportedWikipediaUrls` fetches all tracked Wikipedia URLs on every session mount — could be slow with thousands of items → Accepted for now; at typical personal PKM scale (hundreds of items) this is negligible. Add pagination or a dedicated index if it becomes a problem.

[Risk] Unarchiving an item on Wikipedia ✓ pill click (from within a session) happens optimistically on the client before the server confirms → Mitigation: If the unarchive call fails, show a toast error and do not push the item to the queue.

## Migration Plan

1. **Prisma migration** — add `archivedAt` and `hiddenPassages` to `ReadingItem`. Both are nullable/defaulted; no backfill needed. Existing rows are unaffected.
2. **API rollout** — new procedures are additive. `addWikipediaToQueue` signature changes; update all callers (session page, add page) atomically in the same PR.
3. **UI rollout** — all changes ship in one PR. No feature flags needed (self-hosted, single user).
4. **Rollback** — revert the PR. The migration adds nullable columns; rolling back leaves them populated but ignored by the old code. No data loss.

## Open Questions

- Should the `hiddenPassages` restore use exact string match or index-based? Exact match is simpler but fails if the same passage appears twice in the same article. Decision deferred to implementation: use index-based (store `{ text, index }` objects) if exact-match collision is observed in testing.
- Should `/reading/[id]` be accessible without authentication (for sharing)? Out of scope for this change; all routes remain behind auth.
