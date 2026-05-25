## Context

The reading add page has a two-step Wikipedia flow: fetch preview → user confirms → save. The user wants to collapse this into a single action: submit URL → auto-fetch → auto-save, with a clear loading indicator throughout. Non-Wikipedia URL handling is unchanged.

Current code lives entirely in `open-brain/app/reading/add/page.tsx`. The backend (`fetchWikipedia` query + `addWikipedia` mutation) is reused as-is.

## Goals / Non-Goals

**Goals:**
- When a Wikipedia URL is submitted, automatically add the full article to the queue without showing a preview
- Show a meaningful loading indicator (spinner + label) while fetching and while saving
- Change the submit button label to "Add to queue" for Wikipedia URLs

**Non-Goals:**
- Changing the non-Wikipedia URL preview flow
- Backend changes or new tRPC procedures
- Making the skip-preview behavior configurable

## Decisions

### D1: Auto-add via useEffect
- **Choice:** `useEffect` watching `wikiQuery.data`; calls `addWikipedia.mutate()` when data arrives and mutation is idle
- **Reason:** Minimal change, no new API surface, reuses existing query/mutation pipeline
- **Considered alternative:** New combined tRPC mutation (fetch + save in one call) — rejected as unnecessary complexity

### D2: Loading indicator replaces Skeleton
- **Choice:** Lucide `Loader2` spinner (already in the project) with a two-phase message: "Fetching Wikipedia article…" while `wikiQuery.isFetching`, then "Saving to reading queue…" while `addWikipedia.isPending`
- **Reason:** More informative than 3 blank rectangles; communicates what's happening
- **Considered alternative:** Keep Skeleton — rejected, user explicitly asked for a spinner/indication

### D3: Remove `showWikiPreview` block entirely
- **Choice:** Delete the preview panel and the `showWikiPreview` variable
- **Reason:** It becomes dead code — auto-add fires before the preview can render
- **Considered alternative:** Hide it with CSS — rejected, dead code is worse

### D4: Mutation guard condition
- **Choice:** Only call `addWikipedia.mutate()` when `addWikipedia.isIdle`
- **Reason:** Prevents double-firing when the effect re-runs (e.g., cached query result available immediately)

## Risks / Trade-offs

[Trade-off] User loses the ability to inspect the article before it's added → Accepted: the article title in the URL is sufficient confirmation; the full article is available on the reading item page

[Risk] `useEffect` dependency array could cause stale closure issues → Mitigation: include `addWikipedia.isIdle` in deps; the guard condition prevents double-mutation

## Migration Plan

N/A — pure frontend change, no deployment steps, no DB changes, no new endpoints.

## Open Questions

None.
