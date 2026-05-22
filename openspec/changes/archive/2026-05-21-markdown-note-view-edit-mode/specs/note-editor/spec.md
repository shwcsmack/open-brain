## ADDED Requirements

### Requirement: View/Edit mode toggle

The system SHALL provide a segmented View | Edit pill control in the note header toolbar, positioned between the title input and the Save button. Selecting View SHALL render the note body as formatted markdown. Selecting Edit SHALL open the CodeMirror 6 editor with raw markdown content.

#### Scenario: Default mode is view
- **WHEN** the user navigates to a note detail page
- **THEN** the note body is rendered in view mode and the View segment is active

#### Scenario: Switching to edit mode
- **WHEN** the user clicks the Edit segment
- **THEN** the rendered markdown is replaced by the CodeMirror editor containing the raw markdown string

#### Scenario: Switching to view mode
- **WHEN** the user is in edit mode and clicks the View segment
- **THEN** any pending auto-save debounce is cancelled, the note is saved immediately, and the editor is replaced by the rendered markdown view

---

## MODIFIED Requirements

### Requirement: Rich Markdown editing

The system SHALL provide a CodeMirror 6 editor (edit mode) supporting headings (H1–H3), bold, italic, inline code, code blocks, blockquotes, ordered lists, unordered lists, and horizontal rules, with markdown syntax highlighting. In view mode, the system SHALL render the stored markdown string via react-markdown with remark-gfm, presenting the same formatting as formatted HTML. The system SHALL NOT use TipTap.

#### Scenario: Heading renders in view mode
- **WHEN** the note body contains `## My Heading` and the user is in view mode
- **THEN** the text renders as a level-2 HTML heading

#### Scenario: Bold renders in view mode
- **WHEN** the note body contains `**bold text**` and the user is in view mode
- **THEN** the text renders as bold

#### Scenario: Syntax highlighted in edit mode
- **WHEN** the user switches to edit mode
- **THEN** the CodeMirror editor displays markdown with syntax highlighting

---

### Requirement: Auto-save

The system SHALL automatically persist note content to the database 1 second after the user stops typing in edit mode, without requiring an explicit save action. When the user switches from edit mode to view mode, any pending auto-save debounce SHALL be cancelled and an immediate save SHALL be triggered instead, ensuring exactly one save occurs.

#### Scenario: Auto-save triggers after idle
- **WHEN** the user edits a note and stops typing for 1 second
- **THEN** a tRPC `note.update` mutation is called with the current editor content

#### Scenario: No duplicate saves during rapid typing
- **WHEN** the user types continuously for 5 seconds
- **THEN** at most one save is triggered (debounce resets on each keystroke)

#### Scenario: Mode switch cancels pending debounce
- **WHEN** the user types in edit mode and immediately clicks the View segment before the 1-second debounce fires
- **THEN** one immediate save is triggered and the debounce timer does not fire a second save

---

### Requirement: Notes list

The system SHALL display all notes sorted by `updatedAt` descending, showing each note's title, a 120-character excerpt of body content with markdown syntax stripped (headings, bold, italic, wikilinks, and other markdown tokens removed to produce plain text), and last-updated date.

#### Scenario: Notes list order
- **WHEN** the user navigates to `/`
- **THEN** notes are displayed most-recently-updated first

#### Scenario: Excerpt strips markdown syntax
- **WHEN** a note body begins with `## Title\n**Bold** content [[some-note]]`
- **THEN** the excerpt shown in the list reads `Title Bold content some-note` (or similar plain text, stripped of markdown tokens) truncated to 120 characters

#### Scenario: Tag filter
- **WHEN** the user clicks a tag chip in the notes list
- **THEN** the list filters to show only notes containing that tag
