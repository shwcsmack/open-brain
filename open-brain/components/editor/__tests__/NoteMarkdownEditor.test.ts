/**
 * Focused tests for the pure helpers exported from `NoteMarkdownEditor.tsx`.
 *
 * The helpers run without a DOM, so we explicitly stub the CodeMirror
 * runtime modules that the file imports for side-effects. Without these
 * mocks, `@codemirror/view` would try to read CSS at module load and fail
 * under Jest's `node` test environment.
 */

jest.mock('@codemirror/view', () => ({
  __esModule: true,
  EditorView: {
    theme: () => ({}),
    lineWrapping: {},
    updateListener: { of: () => ({}) },
  },
  drawSelection: () => ({}),
  highlightActiveLine: () => ({}),
  keymap: { of: () => ({}) },
  placeholder: () => ({}),
}))
jest.mock('@codemirror/state', () => ({
  __esModule: true,
  EditorState: { create: () => ({}) },
}))
jest.mock('@codemirror/commands', () => ({
  __esModule: true,
  defaultKeymap: [],
  history: () => ({}),
  historyKeymap: [],
  indentWithTab: {},
}))
jest.mock('@codemirror/language', () => ({
  __esModule: true,
  bracketMatching: () => ({}),
  defaultHighlightStyle: {},
  indentOnInput: () => ({}),
  syntaxHighlighting: () => ({}),
}))
jest.mock('@codemirror/lang-markdown', () => ({
  __esModule: true,
  markdown: () => ({}),
}))
jest.mock('@codemirror/autocomplete', () => ({
  __esModule: true,
  autocompletion: () => ({}),
}))

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  buildFuse,
  buildSearchableNotes,
  buildWikilinkCompletionResult,
  parseTags,
  searchAutocompleteNotes,
  type AutocompleteNote,
  type SearchableNote,
} from '../NoteMarkdownEditor'

const noteFixtures: AutocompleteNote[] = [
  {
    id: '1',
    title: 'Biology',
    slug: 'biology',
    tags: JSON.stringify(['science']),
  },
  {
    id: '2',
    title: 'Chemistry',
    slug: 'chemistry',
    tags: JSON.stringify(['science', 'lab']),
  },
  {
    id: '3',
    title: 'Cooking Recipes',
    slug: 'cooking-recipes',
    tags: JSON.stringify([]),
  },
  {
    id: '4',
    title: 'Quantum Physics',
    slug: 'quantum-physics',
    tags: 'not valid json',
  },
  {
    id: '5',
    title: 'Travel Notes',
    slug: 'travel-notes',
    tags: JSON.stringify(['lab', 'misc']),
  },
]

describe('parseTags', () => {
  test('parses a JSON string array', () => {
    expect(parseTags(JSON.stringify(['a', 'b']))).toEqual(['a', 'b'])
  })
  test('returns empty array for invalid JSON', () => {
    expect(parseTags('not json')).toEqual([])
  })
  test('returns empty array for non-array JSON', () => {
    expect(parseTags(JSON.stringify({ a: 1 }))).toEqual([])
  })
  test('drops non-string entries', () => {
    expect(parseTags(JSON.stringify(['a', 1, null, 'b']))).toEqual(['a', 'b'])
  })
})

describe('buildSearchableNotes', () => {
  test('attaches parsed tagList to each note', () => {
    const result = buildSearchableNotes(noteFixtures)
    expect(result).toHaveLength(noteFixtures.length)
    expect(result[0].tagList).toEqual(['science'])
    expect(result[3].tagList).toEqual([]) // invalid JSON → empty
  })
  test('preserves original fields', () => {
    const result = buildSearchableNotes(noteFixtures)
    expect(result[0].id).toBe('1')
    expect(result[0].slug).toBe('biology')
    expect(result[0].title).toBe('Biology')
  })
})

describe('searchAutocompleteNotes (Fuse integration)', () => {
  const searchable = buildSearchableNotes(noteFixtures)
  const fuse = buildFuse(searchable)

  test('returns empty array when query is empty', () => {
    expect(searchAutocompleteNotes(fuse, '')).toEqual([])
    expect(searchAutocompleteNotes(fuse, '   ')).toEqual([])
  })

  test('matches by title (fuzzy)', () => {
    const results = searchAutocompleteNotes(fuse, 'bio')
    expect(results.map((r) => r.slug)).toContain('biology')
  })

  test('matches by tag', () => {
    const results = searchAutocompleteNotes(fuse, 'science')
    const slugs = results.map((r) => r.slug)
    expect(slugs).toEqual(expect.arrayContaining(['biology', 'chemistry']))
  })

  test('title weight > tag weight: title match outranks tag-only match for the same query', () => {
    // Build a deliberately conflicting fixture where the SAME query string
    // hits one note's title AND another note's tag. With title weighted at
    // 0.8 and tags at 0.2, the title-match note must come first; flipping
    // the weights would invert the order and fail this assertion.
    const conflict = buildSearchableNotes([
      {
        id: 'a',
        title: 'Photography',
        slug: 'photography',
        tags: JSON.stringify([]),
      },
      {
        id: 'b',
        title: 'Travel Journal',
        slug: 'travel-journal',
        tags: JSON.stringify(['photography']),
      },
    ])
    const conflictFuse = buildFuse(conflict)
    const results = searchAutocompleteNotes(conflictFuse, 'photography')
    const slugs = results.map((r) => r.slug)
    // Both notes match the query (one via title, one via tag).
    expect(slugs).toEqual(expect.arrayContaining(['photography', 'travel-journal']))
    // Title match must outrank tag-only match.
    expect(slugs.indexOf('photography')).toBeLessThan(
      slugs.indexOf('travel-journal'),
    )
  })

  test('respects the limit parameter', () => {
    const many: SearchableNote[] = Array.from({ length: 30 }, (_, i) => ({
      id: String(i),
      title: `Topic ${i}`,
      slug: `topic-${i}`,
      tags: '[]',
      tagList: [],
    }))
    const big = buildFuse(many)
    expect(searchAutocompleteNotes(big, 'Topic', 10)).toHaveLength(10)
    expect(searchAutocompleteNotes(big, 'Topic', 5)).toHaveLength(5)
  })
})

describe('buildWikilinkCompletionResult', () => {
  const fuse = buildFuse(buildSearchableNotes(noteFixtures))

  test('returns null for empty query (spec: at least one char after `[[`)', () => {
    const result = buildWikilinkCompletionResult('', 0, 2, fuse)
    expect(result).toBeNull()
  })

  test('returns matched notes wrapped as `[[slug]]` apply strings', () => {
    const result = buildWikilinkCompletionResult('bio', 5, 8, fuse)
    expect(result).not.toBeNull()
    expect(result!.from).toBe(5)
    expect(result!.to).toBe(8)
    expect(result!.filter).toBe(false)

    const biology = result!.options.find((o) => o.label === 'Biology')
    expect(biology).toBeDefined()
    expect(biology!.apply).toBe('[[biology]]')
  })

  test('returns at most `limit` options', () => {
    const many: SearchableNote[] = Array.from({ length: 30 }, (_, i) => ({
      id: String(i),
      title: `Topic ${i}`,
      slug: `topic-${i}`,
      tags: '[]',
      tagList: [],
    }))
    const big = buildFuse(many)
    const result = buildWikilinkCompletionResult('topic', 0, 7, big)
    expect(result!.options).toHaveLength(10)
  })

  test('shows tags in completion detail when present', () => {
    const result = buildWikilinkCompletionResult('Chemistry', 0, 11, fuse)
    const chem = result!.options.find((o) => o.label === 'Chemistry')
    expect(chem!.detail).toContain('science')
    expect(chem!.detail).toContain('lab')
  })

  test('omits detail when no tags', () => {
    const result = buildWikilinkCompletionResult('Cooking', 0, 9, fuse)
    const cooking = result!.options.find((o) => o.label === 'Cooking Recipes')
    expect(cooking!.detail).toBeUndefined()
  })

  test('returns single non-applicable option for empty matches', () => {
    const result = buildWikilinkCompletionResult('xyzzyzzzz', 4, 13, fuse)
    expect(result).not.toBeNull()
    expect(result!.options).toHaveLength(1)
    const empty = result!.options[0]
    expect(empty.label).toBe('No matching notes')
    expect(typeof empty.apply).toBe('function')

    // Selecting the empty-state option must NOT modify the editor: invoking
    // `apply` should not throw, dispatch, or return anything meaningful.
    const dispatch = jest.fn()
    const fakeView = { dispatch }
    const apply = empty.apply as (
      view: unknown,
      completion: unknown,
      from: number,
      to: number,
    ) => void
    apply(fakeView, empty, 4, 13)
    expect(dispatch).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Source-shape regression tests
//
// CodeMirror's update listener fires synchronously inside `view.dispatch(...)`,
// so the order of statements in the controlled-`value` reconciliation effect
// is load-bearing: `lastEmittedValueRef.current = value` MUST happen before
// the dispatch, otherwise parent-originated value changes echo back out via
// `onChange` and cause redundant saves. This file pattern follows the same
// approach already used in `NoteViewer.test.ts` ("does not import rehype-raw")
// and lets us pin a behavioral invariant that would otherwise require jsdom.
// ---------------------------------------------------------------------------
describe('NoteMarkdownEditor source invariants', () => {
  const src = readFileSync(
    join(__dirname, '..', 'NoteMarkdownEditor.tsx'),
    'utf8',
  )

  test('controlled value reconciliation: ref assignment precedes view.dispatch', () => {
    const refIdx = src.indexOf('lastEmittedValueRef.current = value')
    const dispatchIdx = src.indexOf('view.dispatch({')
    expect(refIdx).toBeGreaterThan(-1)
    expect(dispatchIdx).toBeGreaterThan(-1)
    // The LAST `lastEmittedValueRef.current = value` assignment in the file
    // must still come before the dispatch — guards against a future refactor
    // moving the assignment back below the dispatch call.
    const refLastIdx = src.lastIndexOf('lastEmittedValueRef.current = value')
    expect(refLastIdx).toBeLessThan(dispatchIdx)
  })

  test('Fuse index is initialized lazily (not eagerly on every render)', () => {
    // Eager init looks like: `useRef<Fuse<...>>(buildFuse(searchableNotes))`,
    // which evaluates `buildFuse(...)` on every render. Lazy init uses a
    // sentinel-`null` ref, so the literal eager pattern must NOT appear.
    expect(src).not.toMatch(/useRef<[^>]+>\(buildFuse\(/)
    // Sanity: the lazy sentinel-init branch is present.
    expect(src).toMatch(/fuseRef\.current === null/)
  })

  test('does not register the autocomplete keymap twice', () => {
    // `autocompletion()` injects the completion keymap by default. Importing
    // `completionKeymap` from `@codemirror/autocomplete` and spreading it
    // into `keymap.of([...])` would register the same bindings a second
    // time. We assert neither the import nor the spread is present.
    expect(src).not.toMatch(
      /import[\s\S]*?completionKeymap[\s\S]*?from\s+['"]@codemirror\/autocomplete['"]/,
    )
    expect(src).not.toMatch(/\.\.\.completionKeymap/)
  })
})
