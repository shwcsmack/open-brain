## MODIFIED Requirements

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
