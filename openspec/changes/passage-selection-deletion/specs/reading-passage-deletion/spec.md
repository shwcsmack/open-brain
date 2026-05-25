## MODIFIED Requirements

### Requirement: Hide passage persistence

The system SHALL provide a `reading.hidePassage` tRPC mutation that accepts a `readingItemId` and `text`, appends the `text` value to the `hiddenPassages` JSON array on the matching ReadingItem, and returns the updated item. Hidden passages SHALL persist across sessions — whenever the ReadingItem is rendered, passages in `hiddenPassages` SHALL be replaced by tombstones.

When matching stored passage text against the article markdown, the system SHALL treat any whitespace sequence in the stored text as matching any whitespace sequence in the markdown (including single newlines, double newlines, and spaces). This ensures that passages selected across paragraph breaks are correctly hidden.

#### Scenario: Hidden passage persists on reload
- **WHEN** the user hides a passage, closes the session, and reopens it
- **THEN** the hidden passage is still replaced by a tombstone in the rendered content

#### Scenario: Multiple passages hidden independently
- **WHEN** the user hides three different passages from the same ReadingItem
- **THEN** all three are stored in `hiddenPassages` and each is replaced by its own tombstone

#### Scenario: Cross-paragraph passage hidden correctly
- **WHEN** the user selects text that spans two paragraphs (e.g. "end of para one" and "start of para two") and clicks "Delete passage"
- **THEN** the passage is stored and the tombstone replaces the entire selected range including the paragraph break on the next render
