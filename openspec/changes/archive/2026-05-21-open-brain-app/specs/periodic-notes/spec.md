## ADDED Requirements

### Requirement: Periodic note types

The system SHALL support five period granularities — DAY, WEEK, MONTH, QUARTER, YEAR — each identified by a canonical `periodKey` string format.

#### Scenario: Period key formats
- **WHEN** the system generates period keys
- **THEN** DAY uses `YYYY-MM-DD`, WEEK uses `YYYY-WNN` (ISO week), MONTH uses `YYYY-MM`, QUARTER uses `YYYY-QN`, and YEAR uses `YYYY`

---

### Requirement: Idempotent note creation

The system SHALL provide a tRPC `note.getOrCreatePeriodic({ periodType, periodKey })` procedure that returns the existing periodic note if one exists, or creates a new one from the period's template if not.

#### Scenario: Creates note on first access
- **WHEN** the user opens the daily note for 2026-05-19 and no note exists for that date
- **THEN** a new Note is created with periodType DAY, periodKey "2026-05-19", and content from the DAY template

#### Scenario: Returns existing note on repeat access
- **WHEN** the user opens the daily note for 2026-05-19 and a note already exists
- **THEN** the existing note is returned without creating a duplicate

#### Scenario: Unique constraint enforced
- **WHEN** two concurrent requests call `getOrCreatePeriodic` for the same periodType and periodKey
- **THEN** only one note record is created (unique constraint on `(periodType, periodKey)`)

---

### Requirement: Period templates

The system SHALL store user-defined Tiptap JSON templates per period type in a `PeriodicTemplate` table and SHALL apply the matching template when creating a new periodic note.

#### Scenario: Template applied on creation
- **WHEN** the DAY template contains a heading "Daily Log" and the user opens a new daily note
- **THEN** the new note's body is pre-filled with the DAY template content

#### Scenario: Default template used when none defined
- **WHEN** no template exists for a given period type
- **THEN** the new periodic note is created with an empty body

#### Scenario: Template update affects future notes
- **WHEN** the user updates the WEEK template
- **THEN** newly created weekly notes use the updated template; existing notes are unaffected

---

### Requirement: Calendar navigator

The system SHALL display a calendar navigator component in the sidebar providing access to all five period types via tabs, and SHALL highlight today's date and any dates with existing periodic notes.

#### Scenario: Today's note accessible
- **WHEN** the user clicks today's date in the DAY tab of the calendar navigator
- **THEN** `note.getOrCreatePeriodic` is called for today and the note is opened

#### Scenario: Existing notes highlighted
- **WHEN** a periodic note exists for 2026-05-15
- **THEN** that date is visually distinguished in the calendar navigator

#### Scenario: Tab switches period type
- **WHEN** the user switches to the MONTH tab
- **THEN** the calendar shows month-level granularity and clicking opens the monthly note for that month

---

### Requirement: Wikilink resolution for periodic notes

The system SHALL resolve wikilinks in the format `[[daily/YYYY-MM-DD]]`, `[[weekly/YYYY-WNN]]`, `[[monthly/YYYY-MM]]`, `[[quarterly/YYYY-QN]]`, and `[[yearly/YYYY]]` to the corresponding periodic note, creating it if it does not exist.

#### Scenario: Daily wikilink resolves
- **WHEN** a note contains `[[daily/2026-05-19]]`
- **THEN** the wikilink node resolves to the DAY periodic note for 2026-05-19

#### Scenario: Wikilink creates note if absent
- **WHEN** a note contains `[[daily/2026-06-01]]` and no note exists for that date
- **THEN** clicking the wikilink calls `note.getOrCreatePeriodic` and opens the created note
