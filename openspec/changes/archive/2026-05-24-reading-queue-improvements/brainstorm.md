# Brainstorm: Reading Queue Improvements

## Background

The reading queue currently has no item management (no delete, no archive), no way to start a session from a specific item, no delete action while reading, and Wikipedia links show no import state tracking. Wikipedia import requires manually picking sections. The text selection toolbar has no delete action.

---

## Decision Chain

### Q1: Should text-passage deletion persist across sessions?

**Decision:** Yes, persist — but as a soft hide, not a content edit. The deleted passage is stored in a `hiddenPassages` JSON array on the `ReadingItem`. It is hidden whenever that item appears in the queue. Passages are recoverable.

**Recovery UI:** Inline tombstone at the exact location of the deleted passage. A collapsed placeholder shows "🗑 N passages hidden" with a "Restore" button. Multiple consecutive hidden passages are collapsed into one tombstone.

### Q2: Where should archived reading items live in the UI?

**Decision:** A dedicated `/reading/archive` page, linked from the left sidebar as a sub-nav item under Reading (same nav as active queue). Keeps the queue clean; archive is a separate destination.

**Rejected options:**
- Third tab (Due / All / Archive) — archive is not a primary reading workflow, clutters the tab bar
- Collapsible section at the bottom of "All" — too hidden, makes it hard to browse or search archive

### Q3: Are "delete" and "archive" the same action?

**Decision:** No — they are distinct:

| Action | Effect | Wikipedia tracking |
|---|---|---|
| **Archive** | Sets `archivedAt`, item moves to archive log | Preserved (✓ pill stays) |
| **Delete** | Hard deletes the row | Removed from tracking (+ pill reappears) |

Archive is the safe/default action. Delete is destructive and shows an inline confirmation.

### Q4: Should archived items retain their URL?

**Decision:** Yes. Every reading item gets a stable `/reading/[id]` detail page. Archived items remain accessible at their URL with an amber "Archived" banner. The slug (ID) is never changed on archive.

### Q5: What happens when you click a Wikipedia link (+ or ✓ pill)?

**Initial consideration:** Navigate to `/reading/[id]` detail page for active/archived items.

**Revised decision (user preference):** Clicking any Wikipedia link — new, active, or archived — always navigates you to that article immediately in the reading session using a **push-to-front queue mechanism**:

- The clicked article is inserted at position 0 of the current in-memory session queue
- Your current article drops to position 1
- You read the Wikipedia article; when you rate/archive/delete it, the queue advances back to your original article
- No "Back" button needed — the queue IS the navigation stack

**Archived articles:** Clicking the ✓ pill on an archived article unarchives it (clears `archivedAt`) and pushes it to the front of the session queue.

This means the ✓ pill for both active and archived articles does the same thing — push to front — with only the pill color distinguishing the state.

### Q6: What does the Wikipedia pill look like?

| State | Pill | Color | Click behavior |
|---|---|---|---|
| Not imported | `+` | Green tint | Import whole article → push to front |
| Active in queue | `✓` | Blue tint | Push to front of queue |
| Archived | `✓` | Amber tint + "archived" tooltip | Unarchive → push to front |

### Q7: Should Wikipedia import bring in the whole article or let you pick sections?

**Decision:** Whole article, always — no section picker. One `ReadingItem` per Wikipedia article. All sections concatenated with `## Section` headings as content.

This applies to:
- In-session Wikipedia link click handler
- The `/reading/add` page (section picker replaced with a simple "Add whole article" confirm + preview)

**Rationale:** The section picker added friction and encouraged importing partial context. Whole-article import lets you clean up the article yourself using the delete-passage feature while reading.

### Q8: How does the article detail page `/reading/[id]` work?

**Layout:** Two-column — main article content on the left, right sidebar with:
- **Review Stats** — reps, stability, difficulty, last review date
- **Extracts** — child ReadingItems extracted from this article (clickable, link to their own detail pages)
- **Notes** — notes created from this article via "Save as note"
- **Flashcards** — flashcards created from this article

**Archived state:** Amber banner at top: "📦 Archived · [date]" with a "Restore to queue" button that clears `archivedAt` and redirects to the queue.

**Active state:** Same page without the banner. Header includes "Start reading from here" button → navigates to `/reading/session?startFrom=<id>`.

**Navigation source:** Accessed from:
- `/reading/archive` list (clicking an archived item)
- ✓ pill links when NOT in an active session context (e.g., browsing the archive page)

---

## Architecture Decisions

### Data model changes

```prisma
model ReadingItem {
  // existing fields ...

  archivedAt     DateTime?           // null = active, set = archived
  hiddenPassages String   @default("[]")  // JSON array of hidden passage strings
}
```

`deletedAt` is retained for hard delete. `archivedAt` is a separate field.

### New API procedures

| Procedure | Purpose |
|---|---|
| `reading.archive` | Set `archivedAt = now()` |
| `reading.unarchive` | Clear `archivedAt` |
| `reading.delete` | Hard delete; clears Wikipedia tracking |
| `reading.bulkArchive` | Archive multiple items by IDs |
| `reading.bulkDelete` | Hard delete multiple items by IDs |
| `reading.hidePassage` | Append text to `hiddenPassages` JSON array |
| `reading.restorePassage` | Remove text from `hiddenPassages` JSON array |
| `reading.getById` | Fetch single item (active or archived) by ID |
| `reading.listArchived` | List archived items, ordered by `archivedAt DESC` |
| `reading.getImportedWikipediaUrls` | Returns `Record<articleUrl, { id, archivedAt }>` for all non-deleted items with `articleUrl` set |

### Wikipedia tracking

Tracking is implicit: any `ReadingItem` with `articleUrl` set and `deletedAt = null` counts as tracked (whether active or archived). The `getImportedWikipediaUrls` procedure materialises this as a map for the session page to pass into `ExtractHighlighter`.

### Session push-to-front

Pure client-side state manipulation. When a Wikipedia link is clicked during a session:
```typescript
// import/unarchive server-side, then:
setCurrent(wikiItem)
setQueue(prev => [currentItem, ...prev])
```
No page navigation, no session restart.

### `startFrom` query param

`/reading/session?startFrom=<id>` — on queue initialization, the item with that ID is moved to `current`. If not in the due list, it is prepended regardless of due date.

---

## Scope Summary

| Feature | Key change |
|---|---|
| Queue delete/bulk delete | Hover actions + Select mode + sticky bulk bar |
| Queue archive/bulk archive | Same pattern as delete, safer default |
| Start session from item | Click row → session with `?startFrom=<id>` |
| Delete article while reading | `⋮` menu → archive or delete → advance queue |
| Delete text passage | Selection toolbar → tombstone → restorable |
| Wikipedia pill tracking | `getImportedWikipediaUrls` passed to ExtractHighlighter |
| Wikipedia push-to-front | Client-side queue manipulation on link click |
| Whole-article Wikipedia import | Concatenate sections, remove section picker |
| Archive page | `/reading/archive` with source filter + title search |
| Article detail page | `/reading/[id]` with right sidebar |
| Archived item indicator | Amber banner + "Restore to queue" |
