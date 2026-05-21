## Purpose

The flashcard system enables users to create and review spaced-repetition flashcards directly from their notes, supporting both Basic and Cloze card types, organized into decks, and scheduled via the FSRS v5 algorithm.

## Requirements

### Requirement: Basic card creation via shortcut

The system SHALL allow the user to create a Basic flashcard by selecting text in the note editor and pressing ⌘⇧F, opening a modal pre-filled with the selection as the front, where the user adds the back and selects a deck before saving.

#### Scenario: Shortcut opens pre-filled modal
- **WHEN** the user selects "powerhouse of the cell" and presses ⌘⇧F
- **THEN** a card creation modal opens with front pre-filled as "powerhouse of the cell"

#### Scenario: Basic card saved to deck
- **WHEN** the user fills in the back and selects deck "Biology" and saves
- **THEN** a Flashcard record of type BASIC is created with noteId set and added to the Biology deck

---

### Requirement: Cloze card creation via syntax

The system SHALL parse `{{c1::answer}}` syntax in the Tiptap editor as cloze nodes and SHALL sync one Flashcard row per unique `clozeIndex` to the database on every note save, using the full sentence as the `front` template.

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

---

### Requirement: Cards sidebar panel

The system SHALL display a "Cards" panel on every note detail page listing all non-deleted Flashcards associated with the note, with type badges (BASIC / CLOZE) and an "Add card" button.

#### Scenario: Panel lists note's cards
- **WHEN** a note has 2 associated flashcards
- **THEN** the sidebar panel shows both cards with their type badges

#### Scenario: Add card button opens modal
- **WHEN** the user clicks "Add card" in the panel
- **THEN** the card creation modal opens with noteId pre-set to the current note

---

### Requirement: Standalone card creation

The system SHALL allow the user to create a flashcard with no source note via a form on `/decks`, accepting type (BASIC | CLOZE), front, back (optional for CLOZE), and deck selection.

#### Scenario: Standalone card created
- **WHEN** the user submits a standalone card form with type BASIC, front "What is ATP?", back "Adenosine triphosphate"
- **THEN** a Flashcard record is created with noteId null and added to the selected deck

---

### Requirement: Deck management

The system SHALL allow the user to create, rename, and delete decks on a `/decks` page, and SHALL cascade-delete all DeckCard join rows when a deck is deleted (cards themselves are not deleted).

#### Scenario: Deck created
- **WHEN** the user creates a deck named "Chemistry"
- **THEN** a Deck record is created and the deck appears in the deck list

#### Scenario: Deck deleted preserves cards
- **WHEN** the user deletes the "Chemistry" deck
- **THEN** all DeckCard rows for that deck are deleted but the underlying Flashcard records remain

---

### Requirement: FSRS scheduling

The system SHALL schedule flashcard reviews using the FSRS v5 algorithm via `ts-fsrs`, updating the card's `stability`, `difficulty`, `due`, `state`, `reps`, and `lapses` fields on every rating.

#### Scenario: Rating updates FSRS state
- **WHEN** the user rates a card "Good"
- **THEN** the card's `due`, `stability`, `difficulty`, `reps`, and `state` are updated according to FSRS v5

#### Scenario: "Again" rating resets interval
- **WHEN** the user rates a card "Again"
- **THEN** the card's `due` is set to within the next minute and `lapses` is incremented

---

### Requirement: Review hub

The system SHALL provide a `/review` page listing all decks with their due card counts and an "All due cards" virtual row, revalidating every 60 seconds.

#### Scenario: Due counts shown per deck
- **WHEN** the user navigates to `/review`
- **THEN** each deck is listed with the count of cards where `due <= now() AND deletedAt IS NULL`

#### Scenario: All due cards option
- **WHEN** the user clicks "All due cards"
- **THEN** they are navigated to `/review/session` (no deckId param; absent deckId means all cards)

---

### Requirement: Full-screen review session

The system SHALL provide a `/review/session` page presenting cards one at a time in a full-screen flip UI, where Space or Enter reveals the answer and keys 1–4 (Again / Hard / Good / Easy) rate the card and advance the queue.

#### Scenario: Card flip reveals answer
- **WHEN** the user is viewing the front of a card and presses Space
- **THEN** the card flips to reveal the answer side

#### Scenario: Rating advances queue
- **WHEN** the user presses 3 (Good) after revealing the answer
- **THEN** `review.rate` is called with rating "Good", the card's FSRS state is updated, and the next due card is shown

#### Scenario: Cloze sibling blanks rendered
- **WHEN** a cloze card with `{{c1::A}} and {{c2::B}}` is shown testing clozeIndex 1
- **THEN** the card displays "[...] and B" (tested blank hidden as `[...]`, sibling blanks revealed)

#### Scenario: Again cards re-queue
- **WHEN** the user rates a card "Again"
- **THEN** the card is appended to the end of the current session queue, up to a maximum of 3 requeues per card

#### Scenario: Session complete screen
- **WHEN** all cards in the session queue have been rated (excluding again re-queues)
- **THEN** a summary screen is shown with count of cards reviewed, again count, and estimated next session size
