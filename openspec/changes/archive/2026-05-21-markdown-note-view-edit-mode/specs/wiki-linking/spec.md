## MODIFIED Requirements

### Requirement: Wikilink node parsing

The system SHALL treat `[[slug]]` and `[[slug|display text]]` as wikilink syntax within note markdown content. In view mode, the system SHALL preprocess this syntax into standard markdown links (`[display text](/notes/slug)` or `[slug](/notes/slug)`) before passing to react-markdown for rendering. Wikilinks SHALL be rendered as anchor elements; no resolved/unresolved visual distinction is applied at render time. The `displayText` portion (text after `|`) SHALL be used as the link label when present; otherwise the slug is used. The `displayText` attribute MUST NOT affect backlink resolution, which SHALL remain keyed on the slug.

#### Scenario: Wikilink rendered as link in view mode
- **WHEN** the note body contains `[[biology]]` and the user is in view mode
- **THEN** the text renders as a clickable link navigating to `/notes/biology`

#### Scenario: Wikilink with display text
- **WHEN** the note body contains `[[biology|Life Science]]` and the user is in view mode
- **THEN** the link label reads "Life Science" and the link navigates to `/notes/biology`

#### Scenario: Backlink resolution ignores display text
- **WHEN** a note contains `[[our-subaru-ascent|the car]]` and saves
- **THEN** the backlink index records a link to slug `our-subaru-ascent` regardless of the display text

---

### Requirement: Wikilink autocomplete

The system SHALL display an autocomplete dropdown of up to 10 ranked matching notes when the user types `[[` followed by at least one character in the CodeMirror editor. Each dropdown entry SHALL show the note's title and its tags (if any). Results SHALL be ranked by fuzzy match score against both title and tags, with title weighted higher than tags. The dropdown SHALL support keyboard navigation and SHALL be dismissible without inserting a wikilink. On selection, the note's slug SHALL be inserted as `[[slug]]` (or `[[slug|display]]` if the user typed a custom alias).

#### Scenario: Autocomplete triggered
- **WHEN** the user types `[[bio` in the CodeMirror editor
- **THEN** a dropdown appears showing up to 10 notes ranked by fuzzy match score, each entry displaying the note title and any associated tags

#### Scenario: Autocomplete matches on tags
- **WHEN** the user types `[[science` and a note titled "Biology" has a tag "science"
- **THEN** "Biology" appears in the dropdown results

#### Scenario: Autocomplete selection inserts slug
- **WHEN** the user clicks a note entry in the autocomplete dropdown
- **THEN** `[[<slug>]]` is inserted at the cursor position and the dropdown closes

#### Scenario: Autocomplete selection via Enter
- **WHEN** the dropdown is open and the user presses Enter
- **THEN** the currently highlighted note's slug is inserted as `[[<slug>]]` and the dropdown closes

#### Scenario: Keyboard navigation
- **WHEN** the dropdown is open and the user presses ↓ or ↑
- **THEN** the highlight moves to the next or previous item respectively, wrapping at the list boundaries

#### Scenario: Dismiss with Escape
- **WHEN** the dropdown is open and the user presses Escape
- **THEN** the dropdown closes and the typed `[[...` text is left as plain text in the editor

#### Scenario: Empty state
- **WHEN** the user types `[[xyzzy` and no notes match the query
- **THEN** the dropdown shows an empty state message and no items are selectable

---

### Requirement: Backlink index maintenance

The system SHALL maintain a `NoteLink` table of `(sourceNoteId, targetNoteId)` pairs, updated on every note save by extracting all `[[slug]]` occurrences via regex (`/\[\[([^\]|]+)/g`) and resolving slugs to note IDs, then diffing against persisted rows.

#### Scenario: Link added on save
- **WHEN** the user adds `[[biology]]` to a note and the note saves
- **THEN** a `NoteLink` row from the current note to the note with slug `biology` is inserted

#### Scenario: Link removed on save
- **WHEN** the user removes `[[biology]]` from a note and the note saves
- **THEN** the `NoteLink` row from the current note to the biology note is deleted

#### Scenario: Unresolved slugs not persisted
- **WHEN** the note body contains `[[nonexistent-slug]]` and the note saves
- **THEN** no `NoteLink` row is inserted for the unresolved slug
