## MODIFIED Requirements

### Requirement: Wikilink node parsing

The system SHALL parse `[[Note Title]]` syntax in the editor into a first-class `wikilink` node that resolves to a note record by title. The wikilink node SHALL carry a nullable `displayText` attribute (default `null`). When `displayText` is null the node displays the note title; when set, `displayText` is shown in place of the title while `title` continues to hold the canonical note name. The `displayText` attribute MUST NOT affect backlink resolution, which SHALL remain keyed on `noteId`.

#### Scenario: Resolved wikilink rendering
- **WHEN** the editor contains `[[Biology]]` and a note titled "Biology" exists
- **THEN** the text renders as a styled inline chip with a link icon

#### Scenario: Unresolved wikilink rendering
- **WHEN** the editor contains `[[Nonexistent Note]]` and no note with that title exists
- **THEN** the text renders as a dimmed/dashed inline chip indicating the link is broken

#### Scenario: Wikilink node has displayText null by default
- **WHEN** a wikilink is inserted via the standard autocomplete flow with no alias
- **THEN** the node's `displayText` attribute is `null`

#### Scenario: Backlink resolution ignores displayText
- **WHEN** a wikilink node has `displayText = "ascent"` and `noteId` pointing to "Our Subaru Ascent"
- **THEN** the backlink index records a link to "Our Subaru Ascent" regardless of the alias text
