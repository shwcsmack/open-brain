## MODIFIED Requirements

### Requirement: Cloze card creation via syntax

The system SHALL parse `{{c1::answer}}` syntax in the note markdown body as cloze items and SHALL sync one Flashcard row per unique `clozeIndex` to the database on every note save, using extraction regex `/\{\{c(\d+)::([^}]+)\}\}/g` and the full sentence as the `front` template. In view mode, each `{{cN::answer}}` SHALL be rendered as an always-visible highlighted inline `<span>` showing the answer text. The system SHALL NOT use TipTap cloze nodes.

#### Scenario: Cloze sync creates card
- **WHEN** the note body contains `ATP is produced via {{c1::oxidative phosphorylation}}` and the note saves
- **THEN** a Flashcard record of type CLOZE with clozeIndex 1 is created linked to the note

#### Scenario: Multiple cloze indices create multiple cards
- **WHEN** the note contains `{{c1::A}} and {{c2::B}}` and saves
- **THEN** two Flashcard records are created: clozeIndex 1 and clozeIndex 2, both with the same front template

#### Scenario: Removed cloze syntax soft-deletes card
- **WHEN** the user removes `{{c1::answer}}` from the note and it saves
- **THEN** the corresponding Flashcard row's `deletedAt` is set; the card is not hard-deleted

#### Scenario: Soft-deleted card not re-created
- **WHEN** a cloze card has been soft-deleted and the user re-adds identical syntax
- **THEN** the soft-deleted row is restored (deletedAt cleared) rather than a duplicate row created

#### Scenario: Cloze rendered as highlighted span in view mode
- **WHEN** the note body contains `The cell is the {{c1::basic unit of life}}` and the user is in view mode
- **THEN** the text renders with "basic unit of life" displayed as an always-visible highlighted inline span
