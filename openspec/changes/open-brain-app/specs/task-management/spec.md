## ADDED Requirements

### Requirement: Task entity

The system SHALL persist tasks with fields: `title` (string), `status` (TODO | IN_PROGRESS | DONE), `priority` (LOW | MEDIUM | HIGH), `dueDate` (nullable date), and an optional `noteId` foreign key.

#### Scenario: Standalone task creation
- **WHEN** the user submits a new task with title "Write report", priority HIGH, no due date
- **THEN** a Task record is created with status TODO, priority HIGH, dueDate null, noteId null

---

### Requirement: Standalone task view

The system SHALL provide a `/tasks` page displaying all tasks grouped by status (TODO / IN_PROGRESS / DONE), sorted within each group by priority descending then dueDate ascending.

#### Scenario: Tasks grouped by status
- **WHEN** the user navigates to `/tasks`
- **THEN** tasks are displayed in three groups: TODO, IN_PROGRESS, DONE

#### Scenario: Status toggle
- **WHEN** the user checks the checkbox on a TODO task
- **THEN** the task's status changes to DONE and it moves to the DONE group

---

### Requirement: Task filtering

The system SHALL allow the user to filter the task list by status and priority via filter controls on the `/tasks` page.

#### Scenario: Filter by priority
- **WHEN** the user selects "HIGH" in the priority filter
- **THEN** only tasks with priority HIGH are shown

#### Scenario: Filter by status
- **WHEN** the user selects "TODO" in the status filter
- **THEN** only TODO tasks are shown

---

### Requirement: Inline task sync

The system SHALL parse `- [ ]` and `- [x]` Markdown checkbox list items in the Tiptap editor as task nodes, and SHALL sync them to the `Task` table on every note save via diff (insert new, update status changes, soft-delete removed).

#### Scenario: Checkbox creates task
- **WHEN** the user types `- [ ] Buy groceries` in a note and the note saves
- **THEN** a Task record with title "Buy groceries", status TODO, and noteId set to the current note is created

#### Scenario: Checking box updates task
- **WHEN** the user checks the `- [ ] Buy groceries` checkbox and the note saves
- **THEN** the corresponding Task record's status is updated to DONE

#### Scenario: Removing checkbox soft-deletes task
- **WHEN** the user deletes a checkbox line from the note and the note saves
- **THEN** the corresponding Task record is marked deleted (not hard-deleted)

---

### Requirement: Linked note display

The system SHALL display the source note's title (as a link) next to any task in the `/tasks` view that has an associated `noteId`.

#### Scenario: Linked note shown
- **WHEN** a task was created from a note titled "Project Plan"
- **THEN** the task row in `/tasks` shows "Project Plan" as a clickable link

---

### Requirement: Task deletion

The system SHALL allow the user to delete a task from the `/tasks` page after confirmation.

#### Scenario: Task deleted with confirmation
- **WHEN** the user clicks delete on a task and confirms
- **THEN** the task is removed from the list
