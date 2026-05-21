# Wikilink Aliases Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add alias support to wikilinks so `[[Real Title|alias]]` or select-to-link via Cmd+K displays custom text while linking to the real note.

**Architecture:** Add a nullable `displayText` attr to the TipTap wikilink atom node; extend the InputRule regex to parse pipe syntax; add a `pendingAliasRef` in NoteEditor that gets populated by `[[`-while-selected and Cmd+K flows, consumed on autocomplete pick. A shared `getWikilinkDisplay` helper drives both `renderHTML` and `addNodeView` to keep rendering logic in one place.

**Tech Stack:** TipTap 3.x (Node, InputRule, addNodeView), React refs, Jest + ts-jest (node env)

---

## Task 1: Export `getWikilinkDisplay` helper (TDD)

**Files:**
- Modify: `open-brain/components/editor/extensions/__tests__/WikilinkExtension.test.ts`
- Modify: `open-brain/components/editor/extensions/WikilinkExtension.ts`

- [ ] **Step 1: Write the failing tests**

  Append to `open-brain/components/editor/extensions/__tests__/WikilinkExtension.test.ts`:

  ```ts
  import { extractWikilinks, getWikilinkDisplay } from '../WikilinkExtension'

  describe('getWikilinkDisplay', () => {
    test('non-aliased resolved chip', () => {
      const result = getWikilinkDisplay({ displayText: null, title: 'Biology', resolved: true })
      expect(result.text).toBe('[[Biology]]')
      expect(result.className).toBe('wikilink wikilink-resolved')
      expect(result.tooltip).toBeNull()
    })

    test('aliased chip shows tilde prefix and tooltip', () => {
      const result = getWikilinkDisplay({ displayText: 'ascent', title: 'Our Subaru Ascent', resolved: true })
      expect(result.text).toBe('~ascent')
      expect(result.className).toBe('wikilink wikilink-resolved wikilink-aliased')
      expect(result.tooltip).toBe('→ Our Subaru Ascent')
    })

    test('non-aliased unresolved chip', () => {
      const result = getWikilinkDisplay({ displayText: null, title: 'Missing Note', resolved: false })
      expect(result.text).toBe('[[Missing Note]]')
      expect(result.className).toBe('wikilink wikilink-unresolved')
      expect(result.tooltip).toBeNull()
    })

    test('aliased unresolved chip gets aliased class', () => {
      const result = getWikilinkDisplay({ displayText: 'car', title: 'Nonexistent Note', resolved: false })
      expect(result.text).toBe('~car')
      expect(result.className).toBe('wikilink wikilink-unresolved wikilink-aliased')
      expect(result.tooltip).toBe('→ Nonexistent Note')
    })
  })

  test('extractWikilinks ignores displayText — backlinks key off noteId', () => {
    const doc = {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [{
          type: 'wikilink',
          attrs: { noteId: 'abc-123', title: 'Our Subaru Ascent', resolved: true, displayText: 'ascent' },
        }],
      }],
    }
    expect(extractWikilinks(doc)).toEqual(['abc-123'])
  })
  ```

- [ ] **Step 2: Run tests — confirm they fail**

  ```bash
  cd /Users/shayne/open-brain/open-brain && npx jest components/editor/extensions/__tests__/WikilinkExtension.test.ts --no-coverage
  ```

  Expected: FAIL — `getWikilinkDisplay is not a function`

- [ ] **Step 3: Implement `getWikilinkDisplay` in WikilinkExtension.ts**

  Add this function before the `WikilinkExtension` declaration (after the `parsePeriodicWikilink` function):

  ```ts
  export function getWikilinkDisplay(attrs: {
    displayText: string | null
    title: string
    resolved: boolean
  }): { text: string; className: string; tooltip: string | null } {
    const isAliased = !!attrs.displayText
    return {
      text: isAliased ? `~${attrs.displayText}` : `[[${attrs.title}]]`,
      className: [
        'wikilink',
        attrs.resolved ? 'wikilink-resolved' : 'wikilink-unresolved',
        ...(isAliased ? ['wikilink-aliased'] : []),
      ].join(' '),
      tooltip: isAliased ? `→ ${attrs.title}` : null,
    }
  }
  ```

- [ ] **Step 4: Run tests — confirm they pass**

  ```bash
  cd /Users/shayne/open-brain/open-brain && npx jest components/editor/extensions/__tests__/WikilinkExtension.test.ts --no-coverage
  ```

  Expected: All tests PASS

- [ ] **Step 5: Commit**

  ```bash
  cd /Users/shayne/open-brain/open-brain && git add components/editor/extensions/WikilinkExtension.ts components/editor/extensions/__tests__/WikilinkExtension.test.ts
  git commit -m "feat: add getWikilinkDisplay helper for alias-aware chip rendering"
  ```

---

## Task 2: Add `displayText` attr + update renderHTML and addNodeView

**Files:**
- Modify: `open-brain/components/editor/extensions/WikilinkExtension.ts`

- [ ] **Step 1: Add `displayText` to `addAttributes()`**

  Replace:
  ```ts
  addAttributes() {
    return {
      noteId: { default: null },
      noteSlug: { default: null },
      title: { default: '' },
      resolved: { default: false },
    }
  },
  ```

  With:
  ```ts
  addAttributes() {
    return {
      noteId: { default: null },
      noteSlug: { default: null },
      title: { default: '' },
      resolved: { default: false },
      displayText: { default: null },
    }
  },
  ```

- [ ] **Step 2: Update `renderHTML` to use `getWikilinkDisplay`**

  Replace:
  ```ts
  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-wikilink': '',
        class: HTMLAttributes.resolved
          ? 'wikilink wikilink-resolved'
          : 'wikilink wikilink-unresolved',
      }),
      `[[${HTMLAttributes.title}]]`,
    ]
  },
  ```

  With:
  ```ts
  renderHTML({ HTMLAttributes }) {
    const { text, className, tooltip } = getWikilinkDisplay({
      displayText: HTMLAttributes.displayText ?? null,
      title: HTMLAttributes.title,
      resolved: HTMLAttributes.resolved,
    })
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-wikilink': '',
        class: className,
        ...(tooltip ? { title: tooltip } : {}),
      }),
      text,
    ]
  },
  ```

- [ ] **Step 3: Update `addNodeView` to use `getWikilinkDisplay`**

  Replace the entire `addNodeView()` method:
  ```ts
  addNodeView() {
    return ({ node }: { node: { attrs: { displayText: string | null; title: string; resolved: boolean; noteSlug: string | null } }; HTMLAttributes: Record<string, unknown> }) => {
      const dom = document.createElement('span')
      dom.setAttribute('data-wikilink', '')
      const { text, className, tooltip } = getWikilinkDisplay({
        displayText: node.attrs.displayText ?? null,
        title: node.attrs.title,
        resolved: node.attrs.resolved,
      })
      dom.className = className
      dom.textContent = text
      if (tooltip) dom.title = tooltip
      dom.style.cursor = 'pointer'

      dom.addEventListener('click', async () => {
        const title: string = node.attrs.title
        const periodic = parsePeriodicWikilink(title)

        if (periodic) {
          try {
            const { trpcVanilla } = await import('@/lib/trpc-vanilla')
            const note = await trpcVanilla.note.getOrCreatePeriodic.mutate({
              periodType: periodic.periodType,
              periodKey: periodic.periodKey,
            })
            window.location.href = `/notes/${note.slug}`
          } catch (err) {
            console.error('Failed to open periodic note', err)
          }
        } else if (node.attrs.noteSlug) {
          window.location.href = `/notes/${node.attrs.noteSlug}`
        }
      })

      return { dom }
    }
  },
  ```

- [ ] **Step 4: Run tests — no regressions**

  ```bash
  cd /Users/shayne/open-brain/open-brain && npx jest components/editor/extensions/__tests__/WikilinkExtension.test.ts --no-coverage
  ```

  Expected: All tests PASS

- [ ] **Step 5: Commit**

  ```bash
  cd /Users/shayne/open-brain/open-brain && git add components/editor/extensions/WikilinkExtension.ts
  git commit -m "feat: add displayText attr and update wikilink rendering for aliases"
  ```

---

## Task 3: Extend InputRule for pipe syntax

**Files:**
- Modify: `open-brain/components/editor/extensions/WikilinkExtension.ts`

- [ ] **Step 1: Update InputRule regex and handler**

  Replace:
  ```ts
  addInputRules() {
    return [
      new InputRule({
        find: /\[\[([^\]]+)\]\]$/,
        handler: ({ state, range, match }) => {
          const title = match[1]
          const { tr } = state
          tr.replaceWith(
            range.from,
            range.to,
            state.schema.nodes.wikilink.create({ title, resolved: false })
          )
        },
      }),
    ]
  },
  ```

  With:
  ```ts
  addInputRules() {
    return [
      new InputRule({
        find: /\[\[([^\]|]+)(?:\|([^\]]*))?\]\]$/,
        handler: ({ state, range, match }) => {
          const title = match[1]
          const displayText = match[2] ?? null
          const { tr } = state
          tr.replaceWith(
            range.from,
            range.to,
            state.schema.nodes.wikilink.create({ title, resolved: false, displayText })
          )
        },
      }),
    ]
  },
  ```

  The regex explanation:
  - `([^\]|]+)` — title: chars that are not `]` or `|`
  - `(?:\|([^\]]*))?` — optional pipe + alias text (chars that are not `]`)

- [ ] **Step 2: Run existing tests**

  ```bash
  cd /Users/shayne/open-brain/open-brain && npx jest components/editor/extensions/__tests__/WikilinkExtension.test.ts --no-coverage
  ```

  Expected: All tests PASS

- [ ] **Step 3: Commit**

  ```bash
  cd /Users/shayne/open-brain/open-brain && git add components/editor/extensions/WikilinkExtension.ts
  git commit -m "feat: extend InputRule to parse [[title|alias]] pipe syntax"
  ```

---

## Task 4: Add CSS for `.wikilink-aliased`

**Files:**
- Modify: `open-brain/app/globals.css`

- [ ] **Step 1: Add the CSS rule after `.wikilink-unresolved`**

  In `open-brain/app/globals.css`, after the `.wikilink-unresolved` block (line ~149), add:

  ```css
  .wikilink-aliased {
    font-style: italic;
    opacity: 0.85;
  }
  ```

- [ ] **Step 2: Commit**

  ```bash
  cd /Users/shayne/open-brain/open-brain && git add app/globals.css
  git commit -m "feat: add wikilink-aliased CSS for visual distinction of alias chips"
  ```

---

## Task 5: Update `insertWikilink` + add `pendingAliasRef` in NoteEditor

**Files:**
- Modify: `open-brain/components/editor/NoteEditor.tsx`

- [ ] **Step 1: Add `pendingAliasRef` near the other refs**

  In `NoteEditor.tsx`, after `const suggestionRangeRef = useRef<Range | null>(null)` (line 62), add:

  ```ts
  const pendingAliasRef = useRef<string | null>(null)
  ```

- [ ] **Step 2: Update `insertWikilink` to accept and use `displayText`**

  Replace:
  ```ts
  function insertWikilink(note: WikilinkAutocompleteNote, range: Range | null = suggestionRangeRef.current) {
    const ed = editorRef.current
    if (!ed || !range) return

    ed.chain()
      .focus()
      .insertContentAt(range, {
        type: 'wikilink',
        attrs: {
          noteId: note.id,
          noteSlug: note.slug,
          title: note.title,
          resolved: true,
        },
      })
      .run()

    suggestionRangeRef.current = null
    updateSuggestionState(null)
  }
  ```

  With:
  ```ts
  function insertWikilink(
    note: WikilinkAutocompleteNote,
    range: Range | null = suggestionRangeRef.current,
    displayText: string | null = null
  ) {
    const ed = editorRef.current
    if (!ed || !range) return

    ed.chain()
      .focus()
      .insertContentAt(range, {
        type: 'wikilink',
        attrs: {
          noteId: note.id,
          noteSlug: note.slug,
          title: note.title,
          resolved: true,
          displayText: displayText ?? pendingAliasRef.current,
        },
      })
      .run()

    pendingAliasRef.current = null
    suggestionRangeRef.current = null
    updateSuggestionState(null)
  }
  ```

- [ ] **Step 3: Run existing tests**

  ```bash
  cd /Users/shayne/open-brain/open-brain && npx jest --no-coverage
  ```

  Expected: All tests PASS

- [ ] **Step 4: Commit**

  ```bash
  cd /Users/shayne/open-brain/open-brain && git add components/editor/NoteEditor.tsx
  git commit -m "feat: add pendingAliasRef and update insertWikilink to support displayText"
  ```

---

## Task 6: Add Cmd+K select-to-link

**Files:**
- Modify: `open-brain/components/editor/NoteEditor.tsx`

- [ ] **Step 1: Add Cmd+K handler inside the existing `handleKeyDown` function**

  In the `useEffect` that registers the keydown handler (the one with `⌘⇧F shortcut` comment), add the Cmd+K block immediately before the existing `⌘⇧F` check. The target area is after the `if (editor?.isFocused && currentSuggestion) { ... }` block (around line 265):

  ```ts
  // ⌘K: select-to-link — convert selected text to aliased wikilink
  if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === 'k') {
    const ed = editorRef.current
    if (!ed?.isFocused) return
    const { from, to } = ed.state.selection
    if (from === to) return // no selection — let default ⌘K through
    e.preventDefault()
    const selectedText = ed.state.doc.textBetween(from, to)
    pendingAliasRef.current = selectedText
    const range = { from, to }
    suggestionRangeRef.current = range
    let coords: { left: number; top: number; right: number; bottom: number }
    try {
      coords = ed.view.coordsAtPos(from)
    } catch {
      return
    }
    updateSuggestionState({
      rect: new DOMRect(coords.left, coords.top, coords.right - coords.left, coords.bottom - coords.top),
      items: searchNotes(selectedText),
      range,
      selectedIndex: 0,
    })
    return
  }
  ```

- [ ] **Step 2: Run all tests**

  ```bash
  cd /Users/shayne/open-brain/open-brain && npx jest --no-coverage
  ```

  Expected: All tests PASS

- [ ] **Step 3: Commit**

  ```bash
  cd /Users/shayne/open-brain/open-brain && git add components/editor/NoteEditor.tsx
  git commit -m "feat: add Cmd+K select-to-link for aliased wikilink creation"
  ```

---

## Task 7: Add `[[`-while-selected capture

**Files:**
- Modify: `open-brain/components/editor/NoteEditor.tsx`

- [ ] **Step 1: Capture selection on first `[` keystroke**

  At the very top of the `handleKeyDown` function body (before all other `if` checks), add:

  ```ts
  // Capture selection as pending alias when user starts a [[ sequence while text is selected.
  // Must fire before TipTap processes the keystroke (keydown + capture phase).
  if (e.key === '[' && editor?.isFocused) {
    const { from, to } = editor.state.selection
    if (from !== to) {
      pendingAliasRef.current = editor.state.doc.textBetween(from, to)
    }
  }
  ```

- [ ] **Step 2: Clear `pendingAliasRef` when autocomplete is dismissed without a pick**

  In the `Escape` handler inside the `if (editor?.isFocused && currentSuggestion)` block, add `pendingAliasRef.current = null`:

  ```ts
  if (e.key === 'Escape' || e.key === 'Esc') {
    e.preventDefault()
    pendingAliasRef.current = null
    suggestionRangeRef.current = null
    updateSuggestionState(null)
    return
  }
  ```

- [ ] **Step 3: Run all tests**

  ```bash
  cd /Users/shayne/open-brain/open-brain && npx jest --no-coverage
  ```

  Expected: All tests PASS

- [ ] **Step 4: Commit**

  ```bash
  cd /Users/shayne/open-brain/open-brain && git add components/editor/NoteEditor.tsx
  git commit -m "feat: capture selection as pending alias when [[ typed while text selected"
  ```

---

## Self-Review

Spec coverage check:

| Spec requirement | Task covering it |
|---|---|
| Pipe syntax `[[title\|alias]]` creates node with correct `displayText` | Task 3 (InputRule) |
| `displayText = null` by default for non-pipe wikilinks | Task 3 (InputRule handler sets `match[2] ?? null`) |
| Cmd+K with selection opens picker pre-seeded with selection text | Task 6 |
| Cmd+K pick replaces selection with aliased wikilink chip | Task 6 (via `insertWikilink` + `pendingAliasRef`) |
| `[[` while selected captures alias, pick inserts aliased chip | Task 7 |
| Autocomplete dismiss clears pending alias | Task 7, Step 2 |
| Aliased chip renders `~displayText` with `wikilink-aliased` class | Task 2 (`renderHTML` + `addNodeView`) |
| Aliased chip tooltip shows `→ Real Title` | Task 2 |
| Non-aliased chips unchanged | Task 2 (null path in `getWikilinkDisplay`) |
| Backlink extraction uses `noteId`, ignores `displayText` | `extractWikilinks` unchanged — verified by test in Task 1 |
| Wiki-linking spec: `displayText = null` default | Task 2 attr default |
