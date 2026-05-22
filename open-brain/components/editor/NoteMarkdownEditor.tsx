'use client'

import { useEffect, useMemo, useRef } from 'react'
import { EditorState } from '@codemirror/state'
import {
  EditorView,
  drawSelection,
  highlightActiveLine,
  keymap,
  placeholder as placeholderExt,
} from '@codemirror/view'
import {
  bracketMatching,
  defaultHighlightStyle,
  indentOnInput,
  syntaxHighlighting,
} from '@codemirror/language'
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { autocompletion } from '@codemirror/autocomplete'
import type {
  Completion,
  CompletionContext,
  CompletionResult,
  CompletionSource,
} from '@codemirror/autocomplete'
import Fuse from 'fuse.js'
import { cn } from '@/lib/utils'

export interface AutocompleteNote {
  id: string
  title: string
  slug: string
  /** JSON-encoded `string[]` (matches existing app data shape). */
  tags: string
}

export interface SearchableNote extends AutocompleteNote {
  tagList: string[]
}

interface Props {
  value: string
  onChange: (value: string) => void
  notes?: AutocompleteNote[]
  className?: string
  placeholder?: string
}

// ---------------------------------------------------------------------------
// Pure helpers (exported so they can be unit-tested without mounting the DOM).
// ---------------------------------------------------------------------------

export function parseTags(tags: string): string[] {
  try {
    const parsed = JSON.parse(tags)
    return Array.isArray(parsed)
      ? parsed.filter((t): t is string => typeof t === 'string')
      : []
  } catch {
    return []
  }
}

export function buildSearchableNotes(notes: AutocompleteNote[]): SearchableNote[] {
  return notes.map((note) => ({ ...note, tagList: parseTags(note.tags) }))
}

export function buildFuse(notes: SearchableNote[]): Fuse<SearchableNote> {
  // Title weighted higher than tags per spec ("Wikilink autocomplete" §
  // "Results SHALL be ranked by fuzzy match score against both title and
  // tags, with title weighted higher than tags").
  return new Fuse(notes, {
    keys: [
      { name: 'title', weight: 0.8 },
      { name: 'tagList', weight: 0.2 },
    ],
    threshold: 0.4,
    includeScore: true,
    minMatchCharLength: 1,
  })
}

export function searchAutocompleteNotes(
  fuse: Fuse<SearchableNote>,
  query: string,
  limit = 10,
): SearchableNote[] {
  const trimmed = query.trim()
  if (!trimmed) return []
  return fuse.search(trimmed, { limit }).map((r) => r.item)
}

/**
 * Builds the {@link CompletionResult} payload for a wikilink autocomplete
 * trigger. Pure (no editor state, no DOM), so it can be unit-tested.
 *
 * - Returns `null` when the user has not yet typed at least one character
 *   after `[[` (matches the spec: "triggers after [[" + at least one char).
 * - Returns a single non-applicable "No matching notes" option when nothing
 *   matches, so the dropdown still surfaces an empty state.
 * - Otherwise returns up to `limit` ranked matches; selecting one inserts
 *   `[[slug]]` (replacing the entire `[[query` range).
 */
export function buildWikilinkCompletionResult(
  query: string,
  triggerFrom: number,
  cursorPos: number,
  fuse: Fuse<SearchableNote>,
  limit = 10,
): CompletionResult | null {
  if (query.length < 1) return null

  const matches = searchAutocompleteNotes(fuse, query, limit)

  if (matches.length === 0) {
    const empty: Completion = {
      label: 'No matching notes',
      // Non-applicable: selecting this is a no-op so the dropdown closes
      // without inserting anything. This is the closest CodeMirror gives us
      // to a "non-selectable" empty-state row without writing a fully custom
      // tooltip renderer.
      apply: () => {},
      type: 'text',
      boost: -99,
    }
    return {
      from: triggerFrom,
      to: cursorPos,
      options: [empty],
      filter: false,
    }
  }

  return {
    from: triggerFrom,
    to: cursorPos,
    options: matches.map((note) => ({
      label: note.title,
      // CodeMirror will replace the matched range (`[[query`) with this
      // string, producing `[[slug]]` regardless of what the user typed.
      apply: `[[${note.slug}]]`,
      detail: note.tagList.length > 0 ? note.tagList.join(' ') : undefined,
      type: 'text',
    })),
    filter: false,
  }
}

/**
 * Wikilink completion source. Triggers when the text directly before the
 * cursor matches `[[<at-least-one-char>` (excluding `]`, newline, and `|`).
 * The pipe terminates the trigger so typing `[[slug|alias` no longer offers
 * note suggestions for the alias portion.
 */
export function createWikilinkCompletionSource(
  getFuse: () => Fuse<SearchableNote>,
): CompletionSource {
  return (context: CompletionContext): CompletionResult | null => {
    const match = context.matchBefore(/\[\[[^\]\n|]+/)
    if (!match) return null
    const query = match.text.slice(2)
    return buildWikilinkCompletionResult(
      query,
      match.from,
      context.pos,
      getFuse(),
    )
  }
}

// ---------------------------------------------------------------------------
// Theme: wired to CSS variables defined in app/globals.css. Those variables
// are reactive to the `.dark` class (Tailwind v4 `@custom-variant dark`),
// which means the editor automatically re-themes when the app toggles dark
// mode without us reading from a React context. This matches D7 of the
// design doc ("CodeMirror theming mismatch... wire to existing theme
// context"); since the app does not currently mount a `next-themes`
// `ThemeProvider`, CSS variables are the most robust hook.
// ---------------------------------------------------------------------------

const editorTheme = EditorView.theme({
  '&': {
    fontSize: '14px',
    backgroundColor: 'transparent',
    color: 'var(--foreground)',
  },
  '&.cm-focused': {
    outline: 'none',
  },
  '.cm-scroller': {
    fontFamily:
      'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
    lineHeight: '1.6',
  },
  '.cm-content': {
    caretColor: 'var(--foreground)',
    padding: '12px 0',
    minHeight: '300px',
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: 'var(--foreground)',
  },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    color: 'var(--muted-foreground)',
    border: 'none',
  },
  '.cm-activeLine': {
    backgroundColor: 'transparent',
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'transparent',
  },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
    {
      backgroundColor:
        'color-mix(in oklab, var(--accent) 70%, transparent)',
    },
  '.cm-tooltip': {
    backgroundColor: 'var(--popover)',
    color: 'var(--popover-foreground)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md, 0.5rem)',
    boxShadow: '0 8px 24px rgb(0 0 0 / 0.12)',
  },
  '.cm-tooltip.cm-tooltip-autocomplete': {
    padding: '4px',
  },
  '.cm-tooltip.cm-tooltip-autocomplete > ul': {
    fontFamily: 'inherit',
    fontSize: '13px',
    maxHeight: '18em',
    minWidth: '18rem',
  },
  '.cm-tooltip.cm-tooltip-autocomplete > ul > li': {
    padding: '6px 8px',
    borderRadius: 'calc(var(--radius-md, 0.5rem) - 2px)',
    display: 'flex',
    alignItems: 'baseline',
    gap: '8px',
  },
  '.cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]': {
    backgroundColor: 'var(--accent)',
    color: 'var(--accent-foreground)',
  },
  '.cm-tooltip.cm-tooltip-autocomplete .cm-completionLabel': {
    fontWeight: '500',
  },
  '.cm-tooltip.cm-tooltip-autocomplete .cm-completionDetail': {
    fontStyle: 'normal',
    color: 'var(--muted-foreground)',
    fontSize: '12px',
    flex: '1 1 auto',
    textAlign: 'right',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  '.cm-tooltip.cm-tooltip-autocomplete .cm-completionIcon': {
    display: 'none',
  },
  '.cm-placeholder': {
    color: 'var(--muted-foreground)',
  },
})

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function NoteMarkdownEditor({
  value,
  onChange,
  notes,
  className,
  placeholder,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<EditorView | null>(null)

  // Keep the latest `onChange` in a ref so the CodeMirror update listener
  // never has to be re-registered when the parent re-renders.
  const onChangeRef = useRef(onChange)
  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  // Track the last value emitted out of the editor so an incoming `value`
  // prop that simply echoes our own change does NOT re-dispatch a doc reset
  // (which would clobber the cursor and create infinite loops).
  const lastEmittedValueRef = useRef(value)

  // Build / rebuild the Fuse index whenever the notes list changes. The
  // completion source reads from `fuseRef` lazily so existing CM extensions
  // do not need to be torn down on every notes refetch.
  //
  // The ref uses lazy initialization (sentinel `null` + first-access build)
  // so we don't reconstruct the index on every render. Subsequent rebuilds
  // happen exclusively in the `useEffect` below.
  const searchableNotes = useMemo(
    () => buildSearchableNotes(notes ?? []),
    [notes],
  )
  const fuseRef = useRef<Fuse<SearchableNote> | null>(null)
  if (fuseRef.current === null) {
    fuseRef.current = buildFuse(searchableNotes)
  }
  useEffect(() => {
    fuseRef.current = buildFuse(searchableNotes)
  }, [searchableNotes])

  // Mount the editor exactly once. Subsequent prop changes are reconciled by
  // the dedicated effects below.
  useEffect(() => {
    if (!containerRef.current || viewRef.current) return

    // `fuseRef.current` is initialized synchronously during render (lazy
    // sentinel above) before this mount effect runs, so it is never null.
    const completionSource = createWikilinkCompletionSource(
      () => fuseRef.current as Fuse<SearchableNote>,
    )

    const extensions = [
      history(),
      drawSelection(),
      bracketMatching(),
      indentOnInput(),
      highlightActiveLine(),
      EditorView.lineWrapping,
      markdown(),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      // `autocompletion()` registers its own keymap by default
      // (`defaultKeymap: true`), so we do NOT add `completionKeymap` here —
      // doing so would register the same bindings twice.
      autocompletion({
        override: [completionSource],
        activateOnTyping: true,
        closeOnBlur: true,
        maxRenderedOptions: 10,
      }),
      keymap.of([
        ...defaultKeymap,
        ...historyKeymap,
        indentWithTab,
      ]),
      editorTheme,
      EditorView.updateListener.of((update) => {
        if (!update.docChanged) return
        const next = update.state.doc.toString()
        if (next === lastEmittedValueRef.current) return
        lastEmittedValueRef.current = next
        onChangeRef.current(next)
      }),
    ]

    if (placeholder) {
      extensions.push(placeholderExt(placeholder))
    }

    const state = EditorState.create({ doc: value, extensions })
    const view = new EditorView({ state, parent: containerRef.current })
    viewRef.current = view

    return () => {
      view.destroy()
      viewRef.current = null
    }
    // Deliberately mount-once. Placeholder is applied at mount time; if the
    // parent ever needs to change it, they can remount via a `key` prop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Reconcile externally-controlled `value` prop into the editor doc, while
  // ignoring the parent echoing back our own most-recent emission.
  //
  // IMPORTANT: `lastEmittedValueRef` is updated BEFORE `view.dispatch(...)`.
  // CodeMirror invokes update listeners synchronously inside dispatch, and
  // our listener calls `onChange` whenever the doc differs from the ref. If
  // we updated the ref after dispatch, parent-originated `value` changes
  // would echo back out through `onChange` (causing redundant network
  // saves and noisy parent state churn). Setting the ref first marks the
  // upcoming doc state as "already emitted" so the listener becomes a no-op.
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    if (value === lastEmittedValueRef.current) return
    const current = view.state.doc.toString()
    if (current === value) {
      lastEmittedValueRef.current = value
      return
    }
    lastEmittedValueRef.current = value
    view.dispatch({
      changes: { from: 0, to: current.length, insert: value },
    })
  }, [value])

  return (
    <div
      ref={containerRef}
      className={cn(
        'cn-note-markdown-editor w-full rounded-md border border-border bg-background text-foreground',
        className,
      )}
    />
  )
}
