# Wikipedia Full-Article Auto-Add Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a Wikipedia URL is submitted on the reading add page, skip the preview and automatically save the full article to the queue, with a spinner showing progress throughout.

**Architecture:** Pure frontend change in one file (`app/reading/add/page.tsx`). A `useEffect` watches the `fetchWikipedia` query result and fires `addWikipedia.mutate()` automatically when data arrives. The existing Skeleton loading state is replaced with a `Loader2` spinner + contextual message. The preview panel is removed.

**Tech Stack:** Next.js (App Router), tRPC, TanStack Query (via tRPC hooks), lucide-react, Tailwind CSS

---

## Task 1: Auto-add — trigger mutation when Wikipedia fetch completes

**Files:**
- Modify: `open-brain/app/reading/add/page.tsx`

- [ ] **Step 1: Add the auto-add `useEffect`**

  In `page.tsx`, after the `addNote` mutation definition (around line 83), add:

  ```tsx
  useEffect(() => {
    if (wikiQuery.data && addWikipedia.isIdle) {
      addWikipedia.mutate(wikiQuery.data)
    }
  }, [wikiQuery.data, addWikipedia.isIdle])
  ```

  This fires once when the Wikipedia fetch returns data. The `addWikipedia.isIdle` guard prevents double-firing.

- [ ] **Step 2: Remove the `showWikiPreview` variable and its JSX block**

  Delete the variable declaration:
  ```tsx
  const showWikiPreview =
    isWikiFetch && !isFetching && !fetchError && wikiArticle !== undefined
  ```

  Delete the entire `{showWikiPreview && (...)}` JSX block (lines 294–307 in the original file):
  ```tsx
  {showWikiPreview && (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-lg font-semibold">{wikiArticle.title}</h3>
        <p className="text-xs text-muted-foreground mt-1">{submittedUrl}</p>
      </div>
      <div className="rounded-lg border p-4 max-h-96 overflow-y-auto">
        <NoteViewer markdown={wikiArticle.content} />
      </div>
      <Button onClick={handleAddWholeArticle} disabled={addWikipedia.isPending}>
        Add whole article to queue
      </Button>
    </div>
  )}
  ```

- [ ] **Step 3: Remove `handleAddWholeArticle` (now dead code)**

  Delete the function:
  ```tsx
  function handleAddWholeArticle() {
    if (!wikiArticle) {
      toast.error('No article loaded')
      return
    }
    addWikipedia.mutate(wikiArticle)
  }
  ```

- [ ] **Step 4: Verify no TypeScript errors**

  ```bash
  cd open-brain && npx tsc --noEmit
  ```

  Expected: no errors. If `wikiArticle` is now unused, remove `const wikiArticle = wikiQuery.data` as well.

- [ ] **Step 5: Commit**

  ```bash
  git add open-brain/app/reading/add/page.tsx
  git commit -m "feat(reading): auto-add Wikipedia article on fetch — skip preview step"
  ```

---

## Task 2: Loading indicator — spinner with contextual messages

**Files:**
- Modify: `open-brain/app/reading/add/page.tsx`

- [ ] **Step 1: Import `Loader2` from lucide-react**

  Add `Loader2` to the existing lucide-react import (or add a new import if none exists yet). Look for any existing `import ... from 'lucide-react'` line and add `Loader2` to it. If no lucide import exists:

  ```tsx
  import { Loader2 } from 'lucide-react'
  ```

- [ ] **Step 2: Replace the Skeleton loader block with a spinner**

  Find and delete:
  ```tsx
  {isFetching && (
    <div className="flex flex-col gap-2">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  )}
  ```

  Replace with:
  ```tsx
  {isWikiFetch && (wikiQuery.isFetching || addWikipedia.isPending) && (
    <div className="flex items-center gap-3 py-4 text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" />
      <span className="text-sm">
        {wikiQuery.isFetching ? 'Fetching Wikipedia article…' : 'Saving to reading queue…'}
      </span>
    </div>
  )}
  ```

  Note: The old `{isFetching && ...}` block also covers non-Wikipedia URLs — for those we keep Skeletons. So keep the Skeleton block but guard it with `!isWikiFetch`:

  ```tsx
  {!isWikiFetch && isFetching && (
    <div className="flex flex-col gap-2">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  )}
  ```

- [ ] **Step 3: Remove unused `Skeleton` import if no longer needed**

  Check if `Skeleton` is still used elsewhere in the file (it is — kept for non-Wikipedia URL flow). No change needed here if it remains.

- [ ] **Step 4: Verify no TypeScript errors**

  ```bash
  cd open-brain && npx tsc --noEmit
  ```

  Expected: no errors.

- [ ] **Step 5: Commit**

  ```bash
  git add open-brain/app/reading/add/page.tsx
  git commit -m "feat(reading): replace skeleton with spinner + status message for Wikipedia fetch"
  ```

---

## Task 3: Submit button label — "Add to queue" for Wikipedia URLs

**Files:**
- Modify: `open-brain/app/reading/add/page.tsx`

- [ ] **Step 1: Update the submit button label**

  Find the submit button:
  ```tsx
  <Button type="submit" disabled={!urlInput.trim() || isFetching}>
    Fetch preview
  </Button>
  ```

  Replace with:
  ```tsx
  <Button type="submit" disabled={!urlInput.trim() || isFetching}>
    {isEnWikipediaUrl(urlInput) ? 'Add to queue' : 'Fetch preview'}
  </Button>
  ```

  `isEnWikipediaUrl` is already defined at the top of the file — no import needed.

- [ ] **Step 2: Verify no TypeScript errors**

  ```bash
  cd open-brain && npx tsc --noEmit
  ```

  Expected: no errors.

- [ ] **Step 3: Smoke-test in the browser**

  Start the dev server:
  ```bash
  cd open-brain && npm run dev
  ```

  Navigate to `http://localhost:3000/reading/add` and verify:
  1. Typing a Wikipedia URL (e.g. `https://en.wikipedia.org/wiki/Mitochondria`) shows "Add to queue" on the button
  2. Typing a non-Wikipedia URL shows "Fetch preview" on the button
  3. Submitting a Wikipedia URL shows the spinner with "Fetching Wikipedia article…"
  4. After fetch completes, spinner changes to "Saving to reading queue…" briefly
  5. User is redirected to `/reading` automatically — no preview or confirm button

- [ ] **Step 4: Commit**

  ```bash
  git add open-brain/app/reading/add/page.tsx
  git commit -m "feat(reading): change submit button label to 'Add to queue' for Wikipedia URLs"
  ```
