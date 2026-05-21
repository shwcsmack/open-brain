# wikilink-aliases Specification

## Purpose
TBD - created by archiving change wikilink-aliases. Update Purpose after archive.
## Requirements
### Requirement: Alias creation via pipe syntax

The system SHALL parse `[[Real Title|alias]]` in the editor's InputRule and create a resolved wikilink node where `title` is "Real Title" and `displayText` is "alias".

#### Scenario: Pipe syntax creates aliased wikilink
- **WHEN** the user types `[[Our Subaru Ascent|ascent]]` and the note "Our Subaru Ascent" exists
- **THEN** a resolved wikilink chip is inserted with `title = "Our Subaru Ascent"` and `displayText = "ascent"`

#### Scenario: Pipe syntax with no match still resolves if note exists
- **WHEN** the user types `[[Our Subaru Ascent|the car]]` and the note "Our Subaru Ascent" exists
- **THEN** a resolved wikilink chip is inserted linking to "Our Subaru Ascent" with `displayText = "the car"`

#### Scenario: Non-pipe wikilinks are unaffected
- **WHEN** the user types `[[Biology]]` with no pipe character
- **THEN** a normal wikilink node is created with `displayText = null`, rendering identically to the existing behavior

---

### Requirement: Alias creation via select-then-Cmd+K

The system SHALL open the note picker when the user presses `Cmd+K` with text selected in the editor. Upon note selection, the system MUST replace the selected text with a resolved wikilink node where `displayText` equals the originally selected text and `title` equals the picked note's title.

#### Scenario: Cmd+K with selection opens picker
- **WHEN** the user selects the word "ascent" in the editor and presses `Cmd+K`
- **THEN** the note picker opens with "ascent" pre-seeded as the search query

#### Scenario: Picking a note converts selection to aliased wikilink
- **WHEN** the user selects "ascent", presses `Cmd+K`, and picks "Our Subaru Ascent"
- **THEN** "ascent" is replaced by a resolved wikilink chip with `displayText = "ascent"` linking to "Our Subaru Ascent"

#### Scenario: Dismissing picker leaves selection unchanged
- **WHEN** the user selects "ascent", presses `Cmd+K`, and dismisses the picker without selecting a note
- **THEN** the selected text remains as plain text with no wikilink inserted

---

### Requirement: Alias creation via `[[` with selected text

The system SHALL capture the current selection text as a pending alias when the user types `[[` while text is selected, then open autocomplete. Upon note selection, the system MUST insert a resolved wikilink node replacing the original selection with `displayText` equal to the captured text.

#### Scenario: `[[` while selected captures alias and opens autocomplete
- **WHEN** the user selects the word "car" and types `[[`
- **THEN** the selection text "car" is captured as pending alias and the autocomplete dropdown opens

#### Scenario: Picking from autocomplete creates aliased wikilink
- **WHEN** the user selects "car", types `[[`, and picks "Our Subaru Ascent" from autocomplete
- **THEN** "car" is replaced by a resolved wikilink chip with `displayText = "car"` linking to "Our Subaru Ascent"

#### Scenario: Dismissing autocomplete clears pending alias
- **WHEN** the user selects "car", types `[[`, and dismisses autocomplete without picking
- **THEN** no wikilink is inserted and the pending alias is cleared

---

### Requirement: Aliased chip rendering

The system SHALL render wikilink nodes that have a non-null `displayText` with a tilde prefix (`~displayText`) and a hover tooltip disclosing the real note title. Aliased chips SHALL carry the CSS class `wikilink-aliased` in addition to the standard `wikilink` classes.

#### Scenario: Aliased chip shows tilde prefix
- **WHEN** a wikilink node has `displayText = "ascent"` and `title = "Our Subaru Ascent"`
- **THEN** the chip renders the text `~ascent` in the editor

#### Scenario: Aliased chip tooltip reveals real title
- **WHEN** the user hovers over an aliased wikilink chip
- **THEN** a tooltip displays `→ Our Subaru Ascent`

#### Scenario: Aliased chip has correct CSS class
- **WHEN** a wikilink node has a non-null `displayText`
- **THEN** the chip's DOM element includes the class `wikilink-aliased`

#### Scenario: Non-aliased chips are unchanged
- **WHEN** a wikilink node has `displayText = null`
- **THEN** the chip renders as `[[Note Title]]` with no tilde prefix and no `wikilink-aliased` class

