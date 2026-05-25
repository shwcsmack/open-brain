# wikipedia-import Specification

## Purpose
TBD - created by archiving change incremental-reading-module. Update Purpose after archive.
## Requirements
### Requirement: Wikipedia article fetch and section parsing

The system SHALL provide a `reading.fetchWikipedia` tRPC query that accepts a Wikipedia article URL or title, fetches the article HTML from the MediaWiki action API (`https://en.wikipedia.org/w/api.php?action=parse&prop=text|sections|displaytitle&format=json&formatversion=2&redirects=1`), concatenates all top-level sections into a single markdown string with `## Section Title` headings (preserving the Introduction as the lead), strips editorial chrome (e.g. `mw-editsection` spans, `navbox` tables), converts the HTML to markdown server-side, and returns a single object with `title`, `content`, and `articleUrl` fields. The procedure SHALL send a Wikimedia-policy-compliant `User-Agent` header. The procedure SHALL return a descriptive error if the article is missing, the API reports an error, or the fetch fails.

#### Scenario: Valid Wikipedia URL returns single merged article
- **WHEN** `reading.fetchWikipedia` is called with `https://en.wikipedia.org/wiki/Mitochondria`
- **THEN** a single object is returned with `title = "Mitochondria"`, `content` containing all sections merged, and `articleUrl` set

#### Scenario: Unknown article returns error
- **WHEN** `reading.fetchWikipedia` is called with a title that does not exist on Wikipedia
- **THEN** the procedure returns a tRPC error with a user-readable message

#### Scenario: Network failure returns error
- **WHEN** the Wikipedia API is unreachable during the fetch
- **THEN** the procedure returns a tRPC error; no ReadingItem is created

---

### Requirement: Section-level Wikipedia queuing

The system SHALL provide a `reading.addWikipedia` tRPC mutation that accepts `{ title, content, articleUrl }` (a single whole-article object) and creates one `ReadingItem` with `sourceType = WIKIPEDIA`, `articleUrl` set to the article URL, `title` set to the article title, and `content` set to the full article markdown (all sections concatenated with `## Section Title` headings). The mutation SHALL return the created ReadingItem.

#### Scenario: Single whole-article item created
- **WHEN** `reading.addWikipedia` is called with the full article content for Mitochondria
- **THEN** exactly one `ReadingItem` is created with `sourceType = WIKIPEDIA`, `articleUrl` set, and `content` containing all sections

#### Scenario: articleUrl set for tracking
- **WHEN** `reading.addWikipedia` is called with `articleUrl = "https://en.wikipedia.org/wiki/Mitochondria"`
- **THEN** the created ReadingItem has `articleUrl = "https://en.wikipedia.org/wiki/Mitochondria"` and appears in `reading.getImportedWikipediaUrls`

---

### Requirement: Wikipedia content link absolutization

The system SHALL, when converting Wikipedia article HTML to markdown for import, rewrite Wikipedia-relative anchor hrefs (`/wiki/...` and `/w/...`) to absolute URLs whose origin matches the article being imported (e.g. `https://en.wikipedia.org`). The resulting markdown SHALL NOT contain Wikipedia-relative link targets, so the queued content is portable and links are recognizable as Wikipedia URLs by downstream renderers.

#### Scenario: Relative links rewritten to absolute Wikipedia URLs
- **WHEN** a Wikipedia section's HTML contains `<a href="/wiki/Organelle">organelle</a>`
- **THEN** the converted markdown contains `[organelle](https://en.wikipedia.org/wiki/Organelle)` rather than `[organelle](/wiki/Organelle)`

#### Scenario: Article origin used for rewrite
- **WHEN** a section is imported from an article whose URL origin is `https://en.wikipedia.org`
- **THEN** rewritten links use that same origin

---

### Requirement: Wikipedia add page with section checklist

The system SHALL provide a `/reading/add` Next.js route with a URL input field. When a Wikipedia URL is submitted, the page SHALL display a loading indicator with a contextual status message while the article is being fetched and saved. The page SHALL automatically call `reading.addWikipedia` with the full article content as soon as `reading.fetchWikipedia` returns data, without requiring any further user interaction. The page SHALL NOT display a content preview or a confirmation button for Wikipedia URLs. Upon successful save the user SHALL be redirected to `/reading`. The submit button SHALL read "Add to queue" when the URL input contains a Wikipedia URL, and "Fetch preview" otherwise.

#### Scenario: Loading indicator shown during Wikipedia fetch

- **WHEN** the user submits a Wikipedia URL
- **THEN** a spinner and the message "Fetching Wikipedia article…" are displayed; no preview panel is shown

#### Scenario: Loading indicator shown during save

- **WHEN** `reading.fetchWikipedia` has returned data and `reading.addWikipedia` is in progress
- **THEN** a spinner and the message "Saving to reading queue…" are displayed

#### Scenario: Auto-add creates one item and redirects

- **WHEN** `reading.fetchWikipedia` returns the full article data
- **THEN** `reading.addWikipedia` is called automatically with the full merged content and the user is redirected to `/reading` without any button click

#### Scenario: Fetch error shown inline

- **WHEN** the Wikipedia fetch fails
- **THEN** an inline error message is shown on `/reading/add` with a retry option; the user is not navigated away

#### Scenario: Submit button label matches action

- **WHEN** the URL input contains a Wikipedia URL
- **THEN** the submit button reads "Add to queue"

#### Scenario: Submit button label for non-Wikipedia URLs

- **WHEN** the URL input does not contain a Wikipedia URL
- **THEN** the submit button reads "Fetch preview"

### Requirement: Wikipedia import state tracking

The system SHALL provide a `reading.getImportedWikipediaUrls` tRPC query that returns a map of `articleUrl` to `{ id: string; archivedAt: Date | null }` for all ReadingItems where `articleUrl IS NOT NULL` and `deletedAt IS NULL`. The reading session page SHALL call this query on mount and pass the result to `ExtractHighlighter` so Wikipedia link pills can reflect import state.

#### Scenario: Active import returned in map
- **WHEN** a ReadingItem exists with `articleUrl = "https://en.wikipedia.org/wiki/Mitochondria"` and `deletedAt IS NULL` and `archivedAt IS NULL`
- **THEN** `reading.getImportedWikipediaUrls` returns that URL with `archivedAt: null`

#### Scenario: Archived import returned with archivedAt
- **WHEN** a ReadingItem exists with `articleUrl` set, `deletedAt IS NULL`, and `archivedAt` set
- **THEN** `reading.getImportedWikipediaUrls` returns that URL with `archivedAt` populated

#### Scenario: Hard-deleted import excluded from map
- **WHEN** a ReadingItem with `articleUrl` set has `deletedAt` set
- **THEN** `reading.getImportedWikipediaUrls` does not include that URL

---

### Requirement: Non-Wikipedia URL import

The system SHALL provide a `reading.addUrl` tRPC mutation that accepts an arbitrary URL, fetches the page server-side, extracts the main content (title and body text), converts it to markdown, and creates a `ReadingItem` with `sourceType = URL`. If the fetch or content extraction fails, the mutation SHALL return a descriptive error without creating a ReadingItem. The `/reading/add` page SHALL also support non-Wikipedia URLs, showing a title and markdown preview before the user confirms.

#### Scenario: URL import creates ReadingItem
- **WHEN** `reading.addUrl` is called with a valid web page URL
- **THEN** a ReadingItem is created with `sourceType = URL`, `url` set, and `content` containing the extracted markdown

#### Scenario: Failed URL fetch shown as error
- **WHEN** `reading.addUrl` is called with a URL that times out or returns non-HTML content
- **THEN** the mutation returns an error and no ReadingItem is created; the `/reading/add` page shows the error inline with a fallback option to paste content manually

