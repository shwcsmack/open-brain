## MODIFIED Requirements

### Requirement: Wikilink autocomplete

The system SHALL display an autocomplete dropdown of up to 10 ranked matching notes when the user types `[[` followed by at least one character. Each dropdown entry SHALL show the note's title and its tags (if any). Results SHALL be ranked by fuzzy match score against both title and tags, with title weighted higher than tags. The dropdown SHALL support keyboard navigation and SHALL be dismissible without inserting a wikilink.

#### Scenario: Autocomplete triggered
- **WHEN** the user types `[[Bio` in the editor
- **THEN** a dropdown appears showing up to 10 notes ranked by fuzzy match score, each entry displaying the note title and any associated tags

#### Scenario: Autocomplete matches on tags
- **WHEN** the user types `[[science` and a note titled "Biology" has a tag "science"
- **THEN** "Biology" appears in the dropdown results

#### Scenario: Autocomplete selection via click
- **WHEN** the user clicks a note entry in the autocomplete dropdown
- **THEN** a resolved `wikilink` node for that note is inserted at the cursor and the dropdown closes

#### Scenario: Autocomplete selection via Enter
- **WHEN** the dropdown is open and the user presses Enter
- **THEN** the currently highlighted note is inserted as a resolved `wikilink` node and the dropdown closes

#### Scenario: Keyboard navigation
- **WHEN** the dropdown is open and the user presses ↓ or ↑
- **THEN** the highlight moves to the next or previous item respectively, wrapping at the list boundaries

#### Scenario: Dismiss with Escape
- **WHEN** the dropdown is open and the user presses Escape
- **THEN** the dropdown closes and the typed `[[...` text is left as plain text in the editor

#### Scenario: Empty state
- **WHEN** the user types `[[xyzzy` and no notes match the query
- **THEN** the dropdown shows an empty state message and no items are selectable
