## ADDED Requirements

### Requirement: Create a standalone task
The system SHALL allow the user to create tasks independently of any note. A task SHALL have: title (required), status (`TODO` | `IN_PROGRESS` | `DONE`), priority (`LOW` | `MEDIUM` | `HIGH`), optional due date, and optional associated note ID. New tasks SHALL default to status `TODO` and priority `MEDIUM`.

#### Scenario: Create task from task view
- **WHEN** the user submits a new task title in the task list view
- **THEN** the system creates a task record with status `TODO`, priority `MEDIUM`, no due date, and no associated note

#### Scenario: Create task with due date
- **WHEN** the user sets a due date during task creation
- **THEN** the task record stores the ISO date and the task list displays the due date

### Requirement: Task list view
The system SHALL provide a dedicated task list page showing all tasks grouped by status (`TODO`, `IN_PROGRESS`, `DONE`). Within each group tasks SHALL be sorted by priority descending then due date ascending. The list SHALL support filtering by status and priority via UI controls.

#### Scenario: Tasks grouped by status
- **WHEN** the user navigates to the task list page
- **THEN** tasks are displayed in three sections: To Do, In Progress, and Done

#### Scenario: Filter tasks by priority
- **WHEN** the user selects "High priority" filter
- **THEN** only tasks with priority `HIGH` are shown across all status groups

#### Scenario: Empty group is hidden
- **WHEN** no tasks exist with status `DONE`
- **THEN** the "Done" section is not rendered (or shows a collapsed empty state)

### Requirement: Update task status
The system SHALL allow the user to update a task's status by clicking a status control (checkbox for todo→done, dropdown for full state transitions). Status changes SHALL be persisted immediately without a separate save action.

#### Scenario: Checkbox toggles TODO to DONE
- **WHEN** the user checks the checkbox on a `TODO` task
- **THEN** the task status changes to `DONE` and the task moves to the Done group

#### Scenario: Status dropdown allows IN_PROGRESS
- **WHEN** the user opens the status dropdown on a task and selects `IN_PROGRESS`
- **THEN** the task status is updated to `IN_PROGRESS` and the task moves to the In Progress group

### Requirement: Inline tasks in notes
The system SHALL support Markdown checkbox syntax (`- [ ] task title` and `- [x] task title`) within the note editor. When a note is saved, the system SHALL sync checkbox items to the `Task` table with the note's ID as the associated note. Checking or unchecking a checkbox in the editor SHALL update the corresponding task's status on save.

#### Scenario: Markdown checkbox creates linked task
- **WHEN** the user types `- [ ] Review meeting notes` in a note and saves
- **THEN** a `Task` record is created with title "Review meeting notes", status `TODO`, and the note's ID

#### Scenario: Checking checkbox marks task done
- **WHEN** the user checks `- [ ] Review meeting notes` (changing it to `- [x] ...`) and saves
- **THEN** the corresponding task's status is updated to `DONE`

#### Scenario: Note task appears in task list view
- **WHEN** an inline task is created via a note
- **THEN** it appears in the global task list with a link back to the originating note

### Requirement: Edit and delete tasks
The system SHALL allow the user to edit a task's title, priority, and due date via an inline edit form. The system SHALL allow the user to delete a task. Deleting an inline task SHALL remove the checkbox from the note body on next note load.

#### Scenario: Edit task title
- **WHEN** the user edits a task title and confirms
- **THEN** the task record is updated with the new title

#### Scenario: Delete standalone task
- **WHEN** the user deletes a standalone task
- **THEN** the task record is removed and it no longer appears in the task list

#### Scenario: Delete inline task removes from note
- **WHEN** the user deletes a task that originated from a note
- **THEN** the corresponding checkbox line is removed from the note body on the next note load
