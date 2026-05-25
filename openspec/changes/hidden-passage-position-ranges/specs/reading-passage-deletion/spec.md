## MODIFIED Requirements

### Requirement: Hide passage action in selection toolbar

The system SHALL add a fourth action — **Delete passage** — to the text selection toolbar in
the reading session. When the user selects text and clicks "Delete passage", the system SHALL
compute the plain-text character offsets (`start` and `end`) of the selection within the
reading content container, call `reading.hidePassage` with the current item's id and those
offsets, and optimistically re-render the article content with the passage replaced by a
tombstone placeholder.

#### Scenario: Delete passage hides text and shows tombstone
- **WHEN** the user selects a passage and clicks "Delete passage" in the toolbar
- **THEN** `reading.hidePassage` is called with `{ id, start, end }` and the selected text is replaced by an inline tombstone in the rendered content without a page reload

#### Scenario: Toolbar shows Delete passage alongside existing actions
- **WHEN** the user selects text in the reading session content area
- **THEN** the floating toolbar displays four buttons: Extract, Save as Note, Create Flashcard, and Delete passage

#### Scenario: Delete passage on formatted text succeeds
- **WHEN** the user selects text that includes or is adjacent to inline markdown formatting (bold, italic, links) and clicks "Delete passage"
- **THEN** the tombstone appears at the correct location regardless of the surrounding markdown syntax

#### Scenario: Delete passage on repeated text hides only the selected occurrence
- **WHEN** a phrase appears multiple times in the article and the user selects and deletes one occurrence
- **THEN** only that occurrence is replaced by a tombstone; other occurrences remain visible

---

### Requirement: Hide passage persistence

The system SHALL provide a `reading.hidePassage` tRPC mutation that accepts `{ id: string, start: number, end: number }`, appends `{ start, end }` to the `hiddenPassages` JSON array on the matching ReadingItem, and returns the updated item. Hidden passages SHALL persist across sessions — whenever the ReadingItem is rendered, passages whose plain-text ranges are stored in `hiddenPassages` SHALL be replaced by tombstones.

When matching stored passage ranges against the article content, the system SHALL parse the markdown into a remark AST, walk text nodes to build a cumulative plain-text offset to markdown source offset mapping, and use exact offset lookup to locate the markdown range to replace with a tombstone. No regex matching against the raw markdown string SHALL be used.

#### Scenario: Hidden passage persists on reload
- **WHEN** the user hides a passage, closes the session, and reopens it
- **THEN** the hidden passage is still replaced by a tombstone in the rendered content

#### Scenario: Multiple passages hidden independently
- **WHEN** the user hides three different passages from the same ReadingItem
- **THEN** all three are stored in `hiddenPassages` and each is replaced by its own tombstone

#### Scenario: Passage hidden in formatted content persists on reload
- **WHEN** the user hides a passage from content with bold or italic markdown formatting and reopens the session
- **THEN** the tombstone still appears at the correct location

---

### Requirement: Restore passage

The system SHALL provide a `reading.restorePassage` tRPC mutation that accepts `{ id: string, start: number, end: number }`, removes the entry matching those offsets from the `hiddenPassages` JSON array, and returns the updated item. Clicking "Restore" on a tombstone SHALL call this mutation and re-render the content with the passage visible again.

#### Scenario: Restore re-shows hidden passage
- **WHEN** the user clicks "Restore" on a tombstone
- **THEN** `reading.restorePassage` is called with `{ id, start, end }`, the passage is removed from `hiddenPassages`, and the text reappears in the article content

#### Scenario: Restore on multi-passage tombstone restores all collapsed passages
- **WHEN** two passages are collapsed into one tombstone and the user clicks Restore
- **THEN** both passages are restored and the tombstone disappears
