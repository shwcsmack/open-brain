## ADDED Requirements

### Requirement: Graph data endpoint

The system SHALL provide a tRPC `graph.getAll` procedure returning all notes as nodes (`{ id, title, slug }`) and all `NoteLink` rows as directed edges (`{ sourceId, targetId }`).

#### Scenario: Graph data returned
- **WHEN** the client calls `graph.getAll` and 50 notes with 30 links exist
- **THEN** the response contains 50 nodes and 30 edges

---

### Requirement: Interactive graph canvas

The system SHALL render the note graph on a React Flow canvas at `/graph` with force-directed layout, supporting zoom, pan, and node drag.

#### Scenario: Graph page renders
- **WHEN** the user navigates to `/graph`
- **THEN** all notes appear as nodes positioned by d3-force layout and all links appear as edges

#### Scenario: Zoom and pan
- **WHEN** the user scrolls or drags on the canvas
- **THEN** the viewport zooms or pans accordingly without page scroll

---

### Requirement: Node hover highlighting

The system SHALL highlight the hovered node, its direct edges, and its immediate neighbours on hover, and SHALL dim all other nodes and edges.

#### Scenario: Hover highlights neighbourhood
- **WHEN** the user hovers over a node
- **THEN** that node and its direct neighbours are highlighted; all other nodes are dimmed

#### Scenario: Hover clears on mouse-out
- **WHEN** the user moves the cursor off a node
- **THEN** all nodes and edges return to their default style

---

### Requirement: Node click navigation

The system SHALL navigate the user to the note detail page (`/notes/[slug]`) when they click a graph node.

#### Scenario: Click navigates to note
- **WHEN** the user clicks a node labelled "Biology"
- **THEN** the browser navigates to `/notes/biology`

---

### Requirement: Focus mode

The system SHALL support a focus mode activated via `?focus=[noteId]` query parameter that centres the viewport on the target node and hides nodes beyond a configurable hop depth (default 2).

#### Scenario: Focus centres on target
- **WHEN** the user navigates to `/graph?focus=<noteId>`
- **THEN** the target node is centred in the viewport and nodes beyond 2 hops are hidden

#### Scenario: Hop depth slider
- **WHEN** the user adjusts the hop depth slider from 2 to 4
- **THEN** nodes up to 4 hops from the focused node become visible

---

### Requirement: View in graph button

The system SHALL provide a "View in graph" button on note detail pages that navigates to `/graph?focus=[noteId]`.

#### Scenario: Button navigates to focused graph
- **WHEN** the user clicks "View in graph" on a note detail page
- **THEN** the browser navigates to `/graph?focus=<that note's id>`
