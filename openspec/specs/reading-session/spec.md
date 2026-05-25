# reading-session Specification

## Purpose
TBD - created by archiving change incremental-reading-module. Update Purpose after archive.
## Requirements
### Requirement: Session loads highest-priority due item

The system SHALL provide a `/reading/session` Next.js route that on load calls `reading.listDue` and displays the first result (highest priority, then earliest due) as `current`. The route SHALL accept an optional `startFrom` query parameter containing a ReadingItem id. When `startFrom` is present, the system SHALL find the item with that id in the due list and rotate the queue so it becomes `current`. If the item is not in the due list, it SHALL be prepended as `current` regardless of its due date. If no items are due and no `startFrom` is provided, the session SHALL display an empty state with a link back to `/reading`.

#### Scenario: Due item rendered in session
- **WHEN** the user navigates to `/reading/session` and one item is due
- **THEN** the item's title and markdown content are rendered

#### Scenario: Empty session state
- **WHEN** the user navigates to `/reading/session` and no items are due
- **THEN** an empty state message is shown with a link to the queue overview at `/reading`

#### Scenario: startFrom rotates queue to target item
- **WHEN** the user navigates to `/reading/session?startFrom=<id>` and that item is in the due list
- **THEN** that item becomes `current` and the remaining due items follow in their original order

#### Scenario: startFrom prepends non-due item
- **WHEN** the user navigates to `/reading/session?startFrom=<id>` and that item is not due
- **THEN** that item is prepended as `current` and the due items follow

---

### Requirement: Extracted passages highlighted in parent view

The system SHALL visually distinguish passages that have already been extracted from a ReadingItem. For each child ReadingItem whose `parentItemId` matches the current item's id, the system SHALL locate the `extractedText` within the rendered content (using whitespace-normalized string matching) and render it with a dimmed/highlighted visual treatment (e.g., reduced opacity background highlight). If the text cannot be matched, no error is shown.

#### Scenario: Extracted passage dimmed
- **WHEN** the user reads a ReadingItem that has a child extract with `extractedText = "mitochondria are the powerhouse"`
- **THEN** the phrase "mitochondria are the powerhouse" is rendered with a distinct background highlight in the parent item view

#### Scenario: Unmatched extractedText is silent
- **WHEN** the `extractedText` on a child item cannot be located in the parent's current `content`
- **THEN** no error is shown and the rest of the content renders normally

---

### Requirement: Text selection toolbar

The system SHALL display a floating toolbar when the user selects text within the reading session content area. The toolbar SHALL contain four actions: **Extract**, **Save as Note**, **Create Flashcard**, and **Delete passage**. The toolbar SHALL disappear when the selection is cleared.

#### Scenario: Toolbar appears on selection with four actions
- **WHEN** the user selects text in the reading session content area
- **THEN** a floating toolbar appears near the selection with Extract, Save as Note, Create Flashcard, and Delete passage buttons

#### Scenario: Toolbar hidden with no selection
- **WHEN** the user clicks away and clears the selection
- **THEN** the floating toolbar disappears

---

### Requirement: Extract action from session

The system SHALL, when the user clicks "Extract" in the selection toolbar, call `reading.extract` with the current item's id and the selected text, add the resulting child ReadingItem to the queue, and visually mark the selected passage as extracted (dimmed) in the current view without navigating away.

#### Scenario: Extract queues child and dims passage
- **WHEN** the user selects "The cell is the basic unit of life" and clicks Extract
- **THEN** a child ReadingItem is created in the queue and the selected phrase becomes visually dimmed in the current view

---

### Requirement: Save as Note terminal action

The system SHALL, when the user clicks "Save as Note" in the selection toolbar, call `reading.terminateNote` with the selected text as `content` and the first line of the selection as the default `title`, show a confirmation dialog pre-filled with the derived title (editable), and on confirmation create the Note and remove the current item from the session queue.

#### Scenario: Confirmation dialog shown with derived title
- **WHEN** the user selects "ATP is produced via oxidative phosphorylation" and clicks Save as Note
- **THEN** a confirmation dialog appears with title pre-filled as "ATP is produced via oxidative phosphorylation" (truncated if needed)

#### Scenario: Note created and item removed from queue
- **WHEN** the user confirms the Save as Note dialog
- **THEN** a new Note is created with `sourceReadingItemId` set and the ReadingItem is soft-deleted; the session advances to the next due item

---

### Requirement: Create Flashcard terminal action

The system SHALL, when the user clicks "Create Flashcard" in the selection toolbar, open the existing flashcard creation modal with the `front` field pre-filled with the selected text and `sourceReadingItemId` set to the current ReadingItem's id on the created Flashcard.

#### Scenario: Flashcard modal opens pre-filled
- **WHEN** the user selects text and clicks Create Flashcard
- **THEN** the existing flashcard creation modal opens with the selected text in the front field

#### Scenario: Flashcard linked to reading item
- **WHEN** the user saves the flashcard from the modal
- **THEN** the created Flashcard row has `sourceReadingItemId` set to the current ReadingItem's id

---

### Requirement: Wikipedia link interception in reading session

The system SHALL intercept clicks on links whose hostname ends in `wikipedia.org` within the reading session content area. For each clicked link, the system SHALL check whether a ReadingItem with a matching `articleUrl` already exists (active or archived) using the `importedWikipediaUrls` map loaded on session mount. If no matching item exists, the system SHALL fetch the full article via `reading.fetchWikipedia` and create a single whole-article ReadingItem via `reading.addWikipedia`. If a matching archived item exists, the system SHALL call `reading.unarchive` to restore it. In all cases, the resolved ReadingItem SHALL be inserted at the front of the in-memory session queue (pushing the current item to position 2) and `current` SHALL immediately update to that item. The session SHALL guard against duplicate concurrent operations for the same URL.

Wikipedia links in article content SHALL render with a visual pill indicator: a `+` pill (green tint) when the article has not been imported, a blue `✓` pill when an active ReadingItem exists for that `articleUrl`, and an amber `✓` pill when an archived ReadingItem exists.

#### Scenario: New Wikipedia link imports whole article and pushes to front
- **WHEN** the user clicks a `+` pill Wikipedia link while reading item X
- **THEN** the full article is fetched, one ReadingItem is created, it becomes `current`, and item X moves to queue position 2

#### Scenario: Active Wikipedia link pushes existing item to front
- **WHEN** the user clicks a blue `✓` pill Wikipedia link while reading item X
- **THEN** no new import occurs, the existing active item becomes `current`, and item X moves to queue position 2

#### Scenario: Archived Wikipedia link unarchives and pushes to front
- **WHEN** the user clicks an amber `✓` pill Wikipedia link while reading item X
- **THEN** `reading.unarchive` is called on the matching item, it becomes `current`, and item X moves to queue position 2

#### Scenario: Duplicate click guarded
- **WHEN** the user clicks the same Wikipedia link a second time while the first operation is in flight
- **THEN** the second click does not start a second import or push

#### Scenario: Non-Wikipedia links unaffected
- **WHEN** the user clicks a non-Wikipedia link in the session content
- **THEN** the link opens in a new tab and no queue activity occurs

---

### Requirement: Article management actions in session

The system SHALL display a `⋮` overflow menu button in the reading session article header. The menu SHALL contain two actions: **Archive article** and **Delete article**. Clicking "Archive article" SHALL call `reading.archive` on the current item and advance the session to the next item. Clicking "Delete article" SHALL show an inline confirmation; on confirmation, call `reading.delete` on the current item and advance the session.

#### Scenario: Archive article advances session
- **WHEN** the user clicks "Archive article" in the ⋮ menu
- **THEN** `reading.archive` is called on the current item and the session advances to the next item

#### Scenario: Delete article requires confirmation then advances
- **WHEN** the user clicks "Delete article" and confirms
- **THEN** `reading.delete` is called on the current item and the session advances to the next item

---

### Requirement: FSRS rating bar

The system SHALL display a rating bar at the bottom of the reading session with four buttons: **Again**, **Hard**, **Good**, **Easy**. Clicking a rating SHALL call `reading.review` with the current item's id and rating, then advance the session to the next due item.

#### Scenario: Rating submits and advances session
- **WHEN** the user clicks "Good" in the rating bar
- **THEN** `reading.review` is called with rating Good, the current item's FSRS state updates, and the session loads the next due item

#### Scenario: Last item rated shows completion state
- **WHEN** the user rates the last due item
- **THEN** the session shows a completion message with a link back to `/reading`

