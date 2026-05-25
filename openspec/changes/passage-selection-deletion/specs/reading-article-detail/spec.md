## ADDED Requirements

### Requirement: Wikipedia File namespace links rendered as plain links

The system SHALL NOT render Wikipedia links whose path starts with `/wiki/File:` (case-insensitive) as `WikipediaLinkWithPill` import pills. Such URLs (e.g. `https://en.wikipedia.org/wiki/File:Foo.svg`) SHALL be rendered as plain external anchor tags identical to non-Wikipedia links. This applies everywhere `ExtractHighlighter` renders article content.

#### Scenario: File: URL renders as plain link

- **WHEN** article content contains a link to `https://en.wikipedia.org/wiki/File:Example.svg`
- **THEN** it is rendered as a plain `<a>` with `target="_blank"` — no import pill is shown

#### Scenario: Regular Wikipedia article link still shows pill

- **WHEN** article content contains a link to `https://en.wikipedia.org/wiki/Mitochondria`
- **THEN** it is rendered as `WikipediaLinkWithPill` with the appropriate import state indicator

## MODIFIED Requirements

### Requirement: Article detail page

The system SHALL provide a `/reading/[id]` Next.js route that renders a single ReadingItem identified by its `id`. The page SHALL be accessible for both active and archived items. The page SHALL display the article title, source type badge, article content rendered as markdown with tombstones for hidden passages, and a right sidebar. The page SHALL include a back link to `/reading` in the header.

Wikipedia link pills rendered in article content SHALL allow text selection through them (the pill button SHALL NOT suppress `user-select`), so the browser selection highlight is visible over wikilink text.

#### Scenario: Active item renders without archive indicator
- **WHEN** the user navigates to `/reading/[id]` for an active (non-archived) ReadingItem
- **THEN** the article content is rendered and no archived banner is shown

#### Scenario: Non-existent item returns 404
- **WHEN** the user navigates to `/reading/[id]` with an id that does not exist
- **THEN** a 404 page is shown

#### Scenario: Selection highlight visible through wikilink pill
- **WHEN** the user drag-selects text that includes a Wikipedia link pill
- **THEN** the browser selection highlight is continuous and visible over the pill text
