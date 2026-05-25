# Brainstorm: Wikipedia Full-Article Auto-Add + Loading Indicator

## Background

The reading add page (`app/reading/add/page.tsx`) currently has a two-step flow for Wikipedia URLs:

1. User submits a Wikipedia URL → `fetchWikipedia` tRPC query fires
2. Skeleton loader shows while fetching
3. On success → preview panel renders (title + scrollable article preview)
4. User clicks "Add whole article to queue" → `addWikipedia` mutation fires → redirect

The user wants to remove the preview step for Wikipedia: fetch the article and immediately add it to the queue, with a clear loading indicator during the entire operation.

## Decision Chain

**Q1: Should the preview be removed entirely or made opt-in?**  
Decision: Remove entirely for Wikipedia. The preview served as a confirmation step, but the article title in the URL is sufficient confirmation. Non-Wikipedia URLs keep their preview flow unchanged.

**Q2: What triggers the auto-add?**  
Decision: A `useEffect` watching `wikiQuery.data`. When data arrives and the mutation is idle, call `addWikipedia.mutate(wikiQuery.data)` automatically. This is purely a frontend change — no new tRPC procedures needed.

Guard condition: only call mutate when `addWikipedia.isIdle` (prevents double-firing on re-render or cached query results returning immediately).

**Q3: How to handle the loading indicator?**  
Decision: Replace the generic Skeleton loader (3 blank rectangles) with a Loader2 spinner (from lucide-react, already available in the project) and a contextual message. Two phases:
- While fetching: "Fetching Wikipedia article…"
- While saving: "Saving to reading queue…"

Show the spinner for `isWikiFetch && (wikiQuery.isFetching || addWikipedia.isPending)`.

**Q4: What shows when mutation fails?**  
Decision: Keep the existing error UI (the red alert box with Retry button). On error, `addWikipedia.isIdle` becomes false and `addWikipedia.isError` is true — the existing `onError` toast already handles this. The user can clear and try again.

## Design

### Frontend changes only (`app/reading/add/page.tsx`)

1. **Auto-add effect**: 
   ```
   useEffect(() => {
     if (wikiQuery.data && addWikipedia.isIdle) {
       addWikipedia.mutate(wikiQuery.data)
     }
   }, [wikiQuery.data, addWikipedia.isIdle])
   ```

2. **Loading indicator**: Replace `{isFetching && <Skeleton.../>}` with a spinner + message block that covers both fetch and save phases for Wikipedia URLs.

3. **Remove `showWikiPreview` block**: The preview panel (lines 294–307) becomes dead code once auto-add is in place. Remove it and the `showWikiPreview` variable.

4. **Button label**: The submit button currently reads "Fetch preview" — change to "Add to queue" for Wikipedia URLs (detect via `isEnWikipediaUrl(urlInput)`).

### No backend changes needed
The existing `fetchWikipedia` query + `addWikipedia` mutation pipeline is reused as-is.

## Trade-offs Considered

| Approach | Pro | Con |
|---|---|---|
| Frontend useEffect auto-trigger (chosen) | Minimal change, no new API surface | Slightly indirect causality |
| New combined backend mutation (fetch+add) | Single network round-trip | New tRPC procedure, more code |
| Keep preview, add auto-confirm timer | Still shows article | Confusing UX |

## Files to Change

- `open-brain/app/reading/add/page.tsx` — primary change (loading UI + auto-add logic)
