## 1. Auto-add on Wikipedia fetch

- [x] 1.1 Add `useEffect` in `app/reading/add/page.tsx` that watches `wikiQuery.data` and calls `addWikipedia.mutate(wikiQuery.data)` when data arrives and `addWikipedia.isIdle` is true
- [x] 1.2 Remove the `showWikiPreview` variable and the Wikipedia preview panel JSX block (title + scrollable content + "Add whole article to queue" button)

## 2. Loading indicator

- [x] 2.1 Replace the existing Skeleton loader block (shown when `isFetching`) with a spinner + message section that handles two phases: "Fetching Wikipedia article…" (`isWikiFetch && wikiQuery.isFetching`) and "Saving to reading queue…" (`isWikiFetch && addWikipedia.isPending`)
- [x] 2.2 Import `Loader2` from `lucide-react` for the spinner icon

## 3. Submit button label

- [x] 3.1 Change the submit button label to "Add to queue" when `isEnWikipediaUrl(urlInput)` is true, otherwise keep "Fetch preview"
