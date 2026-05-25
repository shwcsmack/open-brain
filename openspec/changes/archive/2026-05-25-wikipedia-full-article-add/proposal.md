## Why

The Wikipedia add flow requires an unnecessary confirmation step: after fetching an article the user must click "Add whole article to queue" to proceed. Since the article title is visible in the URL the user already knows what they're adding. Removing the preview step makes adding a Wikipedia article a single action. The existing loading feedback (skeleton placeholders) also gives no indication of what the app is doing, leaving users uncertain whether the page is responding.

## What Changes

**Wikipedia add flow**
- From: Submit URL → see preview panel → click "Add whole article to queue"
- To: Submit URL → spinner with status message → auto-redirects to reading queue
- Reason: Eliminate unnecessary confirmation step; the article URL is sufficient confirmation
- Impact: Non-breaking — only the Wikipedia branch of the URL add flow is affected

**Loading indicator**
- From: Three generic skeleton rectangles while `isFetching`
- To: Spinner icon + contextual message ("Fetching Wikipedia article…" / "Saving to reading queue…")
- Reason: User asked for explicit visual feedback about what is happening
- Impact: Non-breaking — cosmetic change to the loading state UI

**Submit button label (Wikipedia)**
- From: "Fetch preview" for all URLs
- To: "Add to queue" when input is a Wikipedia URL, "Fetch preview" otherwise
- Reason: Button label should match the actual resulting action
- Impact: Non-breaking — label only

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `wikipedia-import`: UX of the add flow changes (auto-add replaces manual confirm; loading indicator added)

## Impact

- **Affected file:** `open-brain/app/reading/add/page.tsx`
- **No backend changes**
- **No database changes**
- **No new dependencies** — `Loader2` is already exported from `lucide-react`
