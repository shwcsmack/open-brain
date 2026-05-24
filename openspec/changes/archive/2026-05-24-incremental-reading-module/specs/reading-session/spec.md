## ADDED Requirements

### Requirement: Session loads highest-priority due item

The system SHALL provide a `/reading/session` Next.js route that on load calls `reading.listDue` and displays the first result (highest priority, then earliest due). If no items are due, the session SHALL display an empty state with a link back to `/reading`.

#### Scenario: Due item rendered in session
- **WHEN** the user navigates to `/reading/session` and one item is due
- **THEN** the item's title and markdown content are rendered using the existing `NoteViewer` component

#### Scenario: Empty session state
- **WHEN** the user navigates to `/reading/session` and no items are due
- **THEN** an empty state message is shown with a link to the queue overview at `/reading`

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

The system SHALL display a floating toolbar when the user selects text within the reading session content area. The toolbar SHALL contain three actions: **Extract**, **Save as Note**, and **Create Flashcard**. The toolbar SHALL disappear when the selection is cleared.

#### Scenario: Toolbar appears on selection
- **WHEN** the user selects text in the reading session content area
- **THEN** a floating toolbar appears near the selection with Extract, Save as Note, and Create Flashcard buttons

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

### Requirement: FSRS rating bar

The system SHALL display a rating bar at the bottom of the reading session with four buttons: **Again**, **Hard**, **Good**, **Easy**. Clicking a rating SHALL call `reading.review` with the current item's id and rating, then advance the session to the next due item.

#### Scenario: Rating submits and advances session
- **WHEN** the user clicks "Good" in the rating bar
- **THEN** `reading.review` is called with rating Good, the current item's FSRS state updates, and the session loads the next due item

#### Scenario: Last item rated shows completion state
- **WHEN** the user rates the last due item
- **THEN** the session shows a completion message with a link back to `/reading`
