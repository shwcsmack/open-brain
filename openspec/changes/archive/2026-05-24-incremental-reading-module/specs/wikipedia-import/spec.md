## ADDED Requirements

### Requirement: Wikipedia article fetch and section parsing

The system SHALL provide a `reading.fetchWikipedia` tRPC query that accepts a Wikipedia article URL or title, fetches the article from `https://en.wikipedia.org/api/rest_v1/page/mobile-sections/{title}`, converts each section's HTML content to markdown server-side, and returns an array of sections with `title` and `content` fields. The procedure SHALL return a descriptive error if the article is not found or the fetch fails.

#### Scenario: Valid Wikipedia URL returns sections
- **WHEN** `reading.fetchWikipedia` is called with `https://en.wikipedia.org/wiki/Mitochondria`
- **THEN** an array of sections is returned, each with a `title` (e.g., "Structure") and `content` (markdown string)

#### Scenario: Unknown article returns error
- **WHEN** `reading.fetchWikipedia` is called with a title that does not exist on Wikipedia
- **THEN** the procedure returns a tRPC error with a user-readable message

#### Scenario: Network failure returns error
- **WHEN** the Wikipedia API is unreachable during the fetch
- **THEN** the procedure returns a tRPC error; no ReadingItem is created

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

### Requirement: Wikipedia add page with section checklist

The system SHALL provide a `/reading/add` Next.js route with a URL input field. When a Wikipedia URL is submitted, the page SHALL call `reading.fetchWikipedia`, display the returned sections as a checklist with section titles and a content preview, and allow the user to select individual sections before confirming. Confirming SHALL call `reading.addWikipedia` with the selected sections and redirect to `/reading`.

#### Scenario: Section checklist rendered after URL submit
- **WHEN** the user pastes a Wikipedia URL and submits
- **THEN** a checklist of article sections is displayed with checkboxes next to each section title

#### Scenario: Only selected sections queued
- **WHEN** the user checks three of seven sections and clicks "Add to queue"
- **THEN** `reading.addWikipedia` is called with exactly those three sections

#### Scenario: Fetch error shown inline
- **WHEN** the Wikipedia fetch fails
- **THEN** an inline error message is shown on `/reading/add` with a retry option; the user is not navigated away

---

### Requirement: Wikilink follow during reading session

The system SHALL, for ReadingItems with `sourceType = WIKIPEDIA_SECTION`, render links to other Wikipedia articles in the markdown content with an adjacent "+" button. Clicking the "+" button SHALL call `reading.fetchWikipedia` for the linked article and immediately call `reading.addWikipedia` to queue all sections of that article, without navigating away from the current reading session.

#### Scenario: Wikipedia link shows "+" chip
- **WHEN** a WIKIPEDIA_SECTION item is rendered in the session and its content contains a link to another Wikipedia article
- **THEN** a "+" button is rendered adjacent to that link

#### Scenario: Clicking "+" queues linked article
- **WHEN** the user clicks "+" next to a Wikipedia link
- **THEN** all sections of the linked article are added to the reading queue and a success toast confirms the addition

#### Scenario: Non-Wikipedia links are unaffected
- **WHEN** a WIKIPEDIA_SECTION item contains links to non-Wikipedia URLs
- **THEN** those links are rendered normally without a "+" button

---

### Requirement: Non-Wikipedia URL import

The system SHALL provide a `reading.addUrl` tRPC mutation that accepts an arbitrary URL, fetches the page server-side, extracts the main content (title and body text), converts it to markdown, and creates a `ReadingItem` with `sourceType = URL`. If the fetch or content extraction fails, the mutation SHALL return a descriptive error without creating a ReadingItem. The `/reading/add` page SHALL also support non-Wikipedia URLs, showing a title and markdown preview before the user confirms.

#### Scenario: URL import creates ReadingItem
- **WHEN** `reading.addUrl` is called with a valid web page URL
- **THEN** a ReadingItem is created with `sourceType = URL`, `url` set, and `content` containing the extracted markdown

#### Scenario: Failed URL fetch shown as error
- **WHEN** `reading.addUrl` is called with a URL that times out or returns non-HTML content
- **THEN** the mutation returns an error and no ReadingItem is created; the `/reading/add` page shows the error inline with a fallback option to paste content manually
