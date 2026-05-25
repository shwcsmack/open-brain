## ADDED Requirements

### Requirement: Hide passage action in selection toolbar

The system SHALL add a fourth action — **Delete passage** — to the text selection toolbar in the reading session. When the user selects text and clicks "Delete passage", the system SHALL call `reading.hidePassage` with the current item's id and the selected text, and optimistically re-render the article content with the passage replaced by a tombstone placeholder.

#### Scenario: Delete passage hides text and shows tombstone
- **WHEN** the user selects a passage and clicks "Delete passage" in the toolbar
- **THEN** `reading.hidePassage` is called and the selected text is replaced by an inline tombstone in the rendered content without a page reload

#### Scenario: Toolbar shows Delete passage alongside existing actions
- **WHEN** the user selects text in the reading session content area
- **THEN** the floating toolbar displays four buttons: Extract, Save as Note, Create Flashcard, and Delete passage

---

### Requirement: Hide passage persistence

The system SHALL provide a `reading.hidePassage` tRPC mutation that accepts a `readingItemId` and `text`, appends the `text` value to the `hiddenPassages` JSON array on the matching ReadingItem, and returns the updated item. Hidden passages SHALL persist across sessions — whenever the ReadingItem is rendered, passages in `hiddenPassages` SHALL be replaced by tombstones.

#### Scenario: Hidden passage persists on reload
- **WHEN** the user hides a passage, closes the session, and reopens it
- **THEN** the hidden passage is still replaced by a tombstone in the rendered content

#### Scenario: Multiple passages hidden independently
- **WHEN** the user hides three different passages from the same ReadingItem
- **THEN** all three are stored in `hiddenPassages` and each is replaced by its own tombstone

---

### Requirement: Tombstone inline placeholder

The system SHALL render a tombstone in place of each hidden passage. The tombstone SHALL be displayed inline at the exact location of the hidden text. The tombstone SHALL show the count of hidden passages if multiple consecutive passages are collapsed into one tombstone. The tombstone SHALL include a "Restore" button.

#### Scenario: Single tombstone at passage location
- **WHEN** one passage has been hidden from a ReadingItem
- **THEN** a tombstone placeholder appears at the location of the removed text showing "1 passage hidden" and a Restore button

#### Scenario: Consecutive hidden passages collapsed
- **WHEN** two adjacent passages are hidden
- **THEN** a single tombstone shows "2 passages hidden" with a Restore button

---

### Requirement: Restore passage

The system SHALL provide a `reading.restorePassage` tRPC mutation that accepts a `readingItemId` and `text`, removes the first occurrence of that `text` value from the `hiddenPassages` JSON array, and returns the updated item. Clicking "Restore" on a tombstone SHALL call this mutation and re-render the content with the passage visible again.

#### Scenario: Restore re-shows hidden passage
- **WHEN** the user clicks "Restore" on a tombstone
- **THEN** `reading.restorePassage` is called, the passage is removed from `hiddenPassages`, and the text reappears in the article content

#### Scenario: Restore on multi-passage tombstone restores all collapsed passages
- **WHEN** two passages are collapsed into one tombstone and the user clicks Restore
- **THEN** both passages are restored and the tombstone disappears
