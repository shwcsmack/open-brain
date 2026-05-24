# wikipedia-import Specification

## Purpose
TBD - created by archiving change incremental-reading-module. Update Purpose after archive.
## Requirements
### Requirement: Wikipedia article fetch and section parsing

The system SHALL provide a `reading.fetchWikipedia` tRPC query that accepts a Wikipedia article URL or title, fetches the article HTML from the MediaWiki action API (`https://en.wikipedia.org/w/api.php?action=parse&prop=text|sections|displaytitle&format=json&formatversion=2&redirects=1`), splits the returned HTML into top-level sections by their `h2` anchors, strips editorial chrome (e.g. `mw-editsection` spans, `navbox` tables), converts each section's HTML to markdown server-side, and returns an array of sections with `title` and `content` fields. The procedure SHALL send a Wikimedia-policy-compliant `User-Agent` header that identifies the application and a contact URL. The procedure SHALL return a descriptive error if the article is missing (`missingtitle`), the API reports any other error, or the fetch fails.

#### Scenario: Valid Wikipedia URL returns sections
- **WHEN** `reading.fetchWikipedia` is called with `https://en.wikipedia.org/wiki/Mitochondria`
- **THEN** an array of sections is returned, each with a `title` (e.g., "Structure") and `content` (markdown string)

#### Scenario: Unknown article returns error
- **WHEN** `reading.fetchWikipedia` is called with a title that does not exist on Wikipedia
- **THEN** the action API responds with `error.code = "missingtitle"` and the procedure returns a tRPC error with a user-readable message (e.g. "Wikipedia article not found: ...")

#### Scenario: Network failure returns error
- **WHEN** the Wikipedia API is unreachable during the fetch
- **THEN** the procedure returns a tRPC error; no ReadingItem is created

#### Scenario: Identifies itself to Wikipedia
- **WHEN** the procedure calls the action API
- **THEN** the request includes a `User-Agent` header containing the application name and a contact URL so Wikimedia can reach the operator if needed

---

### Requirement: Section-level Wikipedia queuing

The system SHALL provide a `reading.addWikipedia` tRPC mutation that accepts an array of `{ title, content, articleUrl, sectionTitle }` objects and creates one `ReadingItem` per entry with `sourceType = WIKIPEDIA_SECTION`, `articleUrl` set to the parent article URL, and `sectionTitle` set to the section heading. The mutation SHALL return the created ReadingItems.

#### Scenario: Selected sections queued as separate items
- **WHEN** `reading.addWikipedia` is called with two sections from the same article
- **THEN** two `ReadingItem` rows are created, both with the same `articleUrl` and distinct `sectionTitle` values

#### Scenario: Sections share articleUrl for grouping
- **WHEN** multiple sections from `https://en.wikipedia.org/wiki/Mitochondria` are queued
- **THEN** all resulting ReadingItems have `articleUrl = "https://en.wikipedia.org/wiki/Mitochondria"`

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

The system SHALL provide a `/reading/add` Next.js route with a URL input field. When a Wikipedia URL is submitted, the page SHALL call `reading.fetchWikipedia`, display the returned sections as a checklist with section titles and a content preview, and allow the user to select individual sections before confirming. The page SHALL provide a single toggle that selects all sections or clears the selection, and SHALL indicate how many of the available sections are currently selected. Confirming SHALL call `reading.addWikipedia` with the selected sections and redirect to `/reading`.

#### Scenario: Section checklist rendered after URL submit
- **WHEN** the user pastes a Wikipedia URL and submits
- **THEN** a checklist of article sections is displayed with checkboxes next to each section title

#### Scenario: Only selected sections queued
- **WHEN** the user checks three of seven sections and clicks "Add to queue"
- **THEN** `reading.addWikipedia` is called with exactly those three sections

#### Scenario: Select all toggles entire checklist
- **WHEN** the user clicks the "Select all" control on a freshly fetched preview
- **THEN** every section becomes checked and the control's label flips to "Deselect all"
- **AND** an "N of M selected" indicator displays the current selection count

#### Scenario: Deselect all clears selection
- **WHEN** every section is checked and the user clicks "Deselect all"
- **THEN** the selection is cleared and the indicator reads "0 of M selected"

#### Scenario: Fetch error shown inline
- **WHEN** the Wikipedia fetch fails
- **THEN** an inline error message is shown on `/reading/add` with a retry option; the user is not navigated away

---

### Requirement: Non-Wikipedia URL import

The system SHALL provide a `reading.addUrl` tRPC mutation that accepts an arbitrary URL, fetches the page server-side, extracts the main content (title and body text), converts it to markdown, and creates a `ReadingItem` with `sourceType = URL`. If the fetch or content extraction fails, the mutation SHALL return a descriptive error without creating a ReadingItem. The `/reading/add` page SHALL also support non-Wikipedia URLs, showing a title and markdown preview before the user confirms.

#### Scenario: URL import creates ReadingItem
- **WHEN** `reading.addUrl` is called with a valid web page URL
- **THEN** a ReadingItem is created with `sourceType = URL`, `url` set, and `content` containing the extracted markdown

#### Scenario: Failed URL fetch shown as error
- **WHEN** `reading.addUrl` is called with a URL that times out or returns non-HTML content
- **THEN** the mutation returns an error and no ReadingItem is created; the `/reading/add` page shows the error inline with a fallback option to paste content manually

