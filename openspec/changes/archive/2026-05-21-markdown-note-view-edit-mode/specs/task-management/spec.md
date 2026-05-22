## MODIFIED Requirements

### Requirement: Inline task sync

The system SHALL parse `- [ ]` (unchecked) and `- [x]` (checked) GFM checkbox list items in the note markdown body as task items, and SHALL sync them to the `Task` table on every note save via diff (insert new, update status changes, soft-delete removed). Extraction SHALL use regex `/^- \[[ x]\] .+/gm`. The system SHALL NOT use TipTap task item nodes.

#### Scenario: Checkbox creates task
- **WHEN** the user types `- [ ] Buy groceries` in a note and the note saves
- **THEN** a Task record with title "Buy groceries", status TODO, and noteId set to the current note is created

#### Scenario: Checking box updates task
- **WHEN** the user changes `- [ ] Buy groceries` to `- [x] Buy groceries` in the editor and the note saves
- **THEN** the corresponding Task record's status is updated to DONE

#### Scenario: Removing checkbox soft-deletes task
- **WHEN** the user deletes a checkbox line from the note and the note saves
- **THEN** the corresponding Task record is marked deleted (not hard-deleted)
