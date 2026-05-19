## ADDED Requirements

### Requirement: Interactive graph canvas
The system SHALL render an interactive graph view visualizing notes as nodes and wikilinks as directed edges. The canvas SHALL support pan (drag) and zoom (scroll wheel / pinch). The graph SHALL be rendered using React Flow. Each node SHALL display the note title truncated to 30 characters if necessary.

#### Scenario: Graph renders all linked notes
- **WHEN** the user navigates to the graph view
- **THEN** the canvas displays all notes that have at least one forward or backward link as nodes with edges between them

#### Scenario: Isolated notes are shown in graph
- **WHEN** a note has no links to or from any other note
- **THEN** the note still appears as an isolated node in the graph

#### Scenario: User can pan the canvas
- **WHEN** the user clicks and drags on the canvas background
- **THEN** the viewport shifts in the drag direction

#### Scenario: User can zoom the canvas
- **WHEN** the user scrolls the mouse wheel over the canvas
- **THEN** the canvas zooms in or out centered on the cursor position

### Requirement: Node interaction
The system SHALL allow the user to click a node to navigate to that note. Hovering a node SHALL highlight it and all directly connected edges and neighbor nodes.

#### Scenario: Clicking a node navigates to the note
- **WHEN** the user clicks a node in the graph
- **THEN** the application navigates to the corresponding note's detail page

#### Scenario: Hovering a node highlights neighbors
- **WHEN** the user hovers over a node
- **THEN** the hovered node, its direct edges, and its immediate neighbor nodes are visually highlighted; all other nodes and edges are dimmed

### Requirement: Graph layout
The system SHALL use a force-directed layout algorithm to position nodes automatically. The layout SHALL be re-computed when the graph data changes (new note or link added/removed). Nodes MAY be dragged to custom positions; custom positions SHALL NOT be persisted (reset on page reload).

#### Scenario: New link appears in graph after save
- **WHEN** the user saves a note with a new wikilink and returns to the graph view
- **THEN** the new edge appears between the source and target note nodes

#### Scenario: Deleted note removed from graph
- **WHEN** a note is deleted and the user views the graph
- **THEN** the corresponding node and all its edges are absent from the graph

### Requirement: Graph focus mode
The system SHALL support a focus mode accessible from the note detail page that centers the graph on a specific note node and shows only notes within N hops (default 2) of that note.

#### Scenario: Focus mode from note detail
- **WHEN** the user clicks "View in graph" from a note detail page
- **THEN** the graph view opens centered on that note's node, with nodes beyond 2 hops dimmed or hidden

#### Scenario: Hop depth can be adjusted
- **WHEN** the user changes the hop depth slider in focus mode
- **THEN** the set of visible/highlighted nodes updates to match the new depth
