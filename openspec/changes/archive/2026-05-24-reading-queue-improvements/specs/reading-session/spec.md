## ADDED Requirements

### Requirement: Article management actions in session

The system SHALL display a `⋮` overflow menu button in the reading session article header. The menu SHALL contain two actions: **Archive article** and **Delete article**. Clicking "Archive article" SHALL call `reading.archive` on the current item and advance the session to the next item. Clicking "Delete article" SHALL show an inline confirmation; on confirmation, call `reading.delete` on the current item and advance the session.

#### Scenario: Archive article advances session
- **WHEN** the user clicks "Archive article" in the ⋮ menu
- **THEN** `reading.archive` is called on the current item and the session advances to the next item

#### Scenario: Delete article requires confirmation then advances
- **WHEN** the user clicks "Delete article" and confirms
- **THEN** `reading.delete` is called on the current item and the session advances to the next item

---

## MODIFIED Requirements

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

### Requirement: Text selection toolbar

The system SHALL display a floating toolbar when the user selects text within the reading session content area. The toolbar SHALL contain four actions: **Extract**, **Save as Note**, **Create Flashcard**, and **Delete passage**. The toolbar SHALL disappear when the selection is cleared.

#### Scenario: Toolbar appears on selection with four actions
- **WHEN** the user selects text in the reading session content area
- **THEN** a floating toolbar appears near the selection with Extract, Save as Note, Create Flashcard, and Delete passage buttons

#### Scenario: Toolbar hidden with no selection
- **WHEN** the user clicks away and clears the selection
- **THEN** the floating toolbar disappears

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
