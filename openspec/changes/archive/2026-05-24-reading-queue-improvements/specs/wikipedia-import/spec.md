## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: Section-level Wikipedia queuing

The system SHALL provide a `reading.addWikipedia` tRPC mutation that accepts `{ title, content, articleUrl }` (a single whole-article object) and creates one `ReadingItem` with `sourceType = WIKIPEDIA`, `articleUrl` set to the article URL, `title` set to the article title, and `content` set to the full article markdown (all sections concatenated with `## Section Title` headings). The mutation SHALL return the created ReadingItem.

#### Scenario: Single whole-article item created
- **WHEN** `reading.addWikipedia` is called with the full article content for Mitochondria
- **THEN** exactly one `ReadingItem` is created with `sourceType = WIKIPEDIA`, `articleUrl` set, and `content` containing all sections

#### Scenario: articleUrl set for tracking
- **WHEN** `reading.addWikipedia` is called with `articleUrl = "https://en.wikipedia.org/wiki/Mitochondria"`
- **THEN** the created ReadingItem has `articleUrl = "https://en.wikipedia.org/wiki/Mitochondria"` and appears in `reading.getImportedWikipediaUrls`

---

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

### Requirement: Wikipedia add page with section checklist

The system SHALL provide a `/reading/add` Next.js route with a URL input field. When a Wikipedia URL is submitted, the page SHALL call `reading.fetchWikipedia`, display the article title and a scrollable content preview, and show a single "Add whole article to queue" button. The page SHALL NOT display a section checklist or allow partial selection. Clicking "Add whole article to queue" SHALL call `reading.addWikipedia` with the full article and redirect to `/reading`.

#### Scenario: Whole article preview shown after URL submit
- **WHEN** the user pastes a Wikipedia URL and submits
- **THEN** the article title and a content preview are displayed with an "Add whole article to queue" button; no section checkboxes are shown

#### Scenario: Add whole article creates one item and redirects
- **WHEN** the user clicks "Add whole article to queue"
- **THEN** `reading.addWikipedia` is called with the full merged content and the user is redirected to `/reading`

#### Scenario: Fetch error shown inline
- **WHEN** the Wikipedia fetch fails
- **THEN** an inline error message is shown on `/reading/add` with a retry option; the user is not navigated away

