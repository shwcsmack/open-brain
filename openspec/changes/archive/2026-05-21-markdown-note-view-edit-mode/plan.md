# Markdown Note View/Edit Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace TipTap entirely with a markdown-based view/edit mode — raw markdown stored in the DB, rendered via react-markdown in view mode and edited via CodeMirror 6 in edit mode, with all existing features (wikilinks, tasks, cloze) preserved via regex extraction.

**Architecture:** `NoteViewer` is a pure markdown renderer (react-markdown + wikilink preprocessing + cloze spans). `NoteMarkdownEditor` is a CodeMirror 6 editor with `[[` autocomplete via Fuse.js. The note page holds `mode: 'view' | 'edit'` state and a `bodyValue` state variable that drives both components. Save side-effects (wikilink sync, task sync, cloze sync) move from TipTap node walking to pure regex functions in `lib/markdownExtract.ts`. No Prisma migration needed; no production data exists.

**Tech Stack:** react-markdown, remark-gfm, rehype-raw, @codemirror/view, @codemirror/state, @codemirror/lang-markdown, @codemirror/autocomplete, @codemirror/commands, Fuse.js (already installed)

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `lib/markdownExtract.ts` | Create | Pure regex extraction: wikilink slugs, tasks, cloze items |
| `lib/stripMarkdown.ts` | Create | Strip markdown tokens → plain text for excerpts |
| `components/editor/NoteViewer.tsx` | Create | react-markdown renderer with wikilink + cloze preprocessing |
| `components/editor/NoteMarkdownEditor.tsx` | Create | CodeMirror 6 editor + `[[` autocomplete + ⌘⇧F card modal |
| `app/notes/[slug]/page.tsx` | Rewrite | Mode state, View/Edit toggle, debounce, new save logic |
| `app/page.tsx` | Modify | Use `stripMarkdown` for notes list excerpt |
| `server/routers/noteLink.ts` | Modify | Use `stripMarkdown` for backlink excerpt |
| `server/routers/note.ts` | Modify | Use `''` instead of TipTap JSON for periodic note default body |
| `components/editor/NoteEditor.tsx` | Delete | Replaced |
| `components/editor/WikilinkAutocomplete.tsx` | Delete | Replaced |
| `components/editor/extensions/*.ts` | Delete | Replaced by markdownExtract.ts |
| `tests/wikilink-serializer.test.ts` | Delete | Tests TipTap serializers (removed) |
| `tests/cloze-serializer.test.ts` | Delete | Tests TipTap serializers (removed) |

---

## Task 1: Install and remove packages

**Files:**
- Modify: `open-brain/package.json`

- [ ] **Step 1: Install new packages**

```bash
cd open-brain
npm install react-markdown remark-gfm rehype-raw @codemirror/view @codemirror/state @codemirror/lang-markdown @codemirror/autocomplete @codemirror/commands @codemirror/language
```

- [ ] **Step 2: Verify packages resolve**

```bash
cd open-brain && node -e "require('react-markdown'); require('@codemirror/view'); require('@codemirror/lang-markdown'); console.log('OK')"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
cd open-brain && git add package.json package-lock.json
git commit -m "chore: install react-markdown and CodeMirror 6 packages"
```

---

## Task 2: Create `lib/markdownExtract.ts`

**Files:**
- Create: `open-brain/lib/markdownExtract.ts`
- Create: `open-brain/tests/markdownExtract.test.ts`

- [ ] **Step 1: Write failing tests**

Create `open-brain/tests/markdownExtract.test.ts`:

```ts
import { extractWikilinkSlugs, extractTasks, extractClozeItems } from '../lib/markdownExtract'

describe('extractWikilinkSlugs', () => {
  it('extracts a single slug', () => {
    expect(extractWikilinkSlugs('See [[biology]].')).toEqual(['biology'])
  })
  it('extracts slug from [[slug|display]]', () => {
    expect(extractWikilinkSlugs('See [[biology|Life Science]].')).toEqual(['biology'])
  })
  it('extracts multiple slugs', () => {
    expect(extractWikilinkSlugs('[[a]] and [[b]]')).toEqual(['a', 'b'])
  })
  it('returns empty for no wikilinks', () => {
    expect(extractWikilinkSlugs('No links here.')).toEqual([])
  })
})

describe('extractTasks', () => {
  it('extracts unchecked task', () => {
    expect(extractTasks('- [ ] Buy groceries')).toEqual([{ title: 'Buy groceries', done: false }])
  })
  it('extracts checked task', () => {
    expect(extractTasks('- [x] Buy groceries')).toEqual([{ title: 'Buy groceries', done: true }])
  })
  it('extracts multiple tasks', () => {
    const md = '- [ ] Task A\n- [x] Task B'
    expect(extractTasks(md)).toEqual([
      { title: 'Task A', done: false },
      { title: 'Task B', done: true },
    ])
  })
  it('ignores non-task lines', () => {
    expect(extractTasks('paragraph\n- [ ] Real task')).toEqual([{ title: 'Real task', done: false }])
  })
})

describe('extractClozeItems', () => {
  it('extracts a single cloze item', () => {
    const md = 'ATP via {{c1::oxidative phosphorylation}}'
    expect(extractClozeItems(md)).toEqual([
      { front: md, clozeIndex: 1, answer: 'oxidative phosphorylation' },
    ])
  })
  it('extracts multiple cloze items with same front', () => {
    const md = '{{c1::A}} and {{c2::B}}'
    expect(extractClozeItems(md)).toEqual([
      { front: md, clozeIndex: 1, answer: 'A' },
      { front: md, clozeIndex: 2, answer: 'B' },
    ])
  })
  it('returns empty when no cloze', () => {
    expect(extractClozeItems('No cloze here.')).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests — confirm fail**

```bash
cd open-brain && npx jest tests/markdownExtract.test.ts
```

Expected: FAIL — `Cannot find module '../lib/markdownExtract'`

- [ ] **Step 3: Create `lib/markdownExtract.ts`**

```ts
export function extractWikilinkSlugs(body: string): string[] {
  return [...body.matchAll(/\[\[([^\]|]+)/g)].map(m => m[1].trim())
}

export function extractTasks(body: string): { title: string; done: boolean }[] {
  return [...body.matchAll(/^- \[([ x])\] (.+)$/gm)].map(m => ({
    title: m[2].trim(),
    done: m[1] === 'x',
  }))
}

export function extractClozeItems(
  body: string
): { front: string; clozeIndex: number; answer: string }[] {
  return [...body.matchAll(/\{\{c(\d+)::([^}]+)\}\}/g)].map(m => ({
    front: body,
    clozeIndex: parseInt(m[1], 10),
    answer: m[2],
  }))
}
```

- [ ] **Step 4: Run tests — confirm pass**

```bash
cd open-brain && npx jest tests/markdownExtract.test.ts
```

Expected: PASS — 9 tests

- [ ] **Step 5: Commit**

```bash
cd open-brain && git add lib/markdownExtract.ts tests/markdownExtract.test.ts
git commit -m "feat: add markdownExtract utilities for wikilinks, tasks, and cloze"
```

---

## Task 3: Create `lib/stripMarkdown.ts`

**Files:**
- Create: `open-brain/lib/stripMarkdown.ts`
- Create: `open-brain/tests/stripMarkdown.test.ts`

- [ ] **Step 1: Write failing tests**

Create `open-brain/tests/stripMarkdown.test.ts`:

```ts
import { stripMarkdown } from '../lib/stripMarkdown'

describe('stripMarkdown', () => {
  it('strips heading markers', () => {
    expect(stripMarkdown('## My Heading')).toBe('My Heading')
  })
  it('strips bold **', () => {
    expect(stripMarkdown('**bold text**')).toBe('bold text')
  })
  it('strips italic *', () => {
    expect(stripMarkdown('*italic*')).toBe('italic')
  })
  it('strips wikilink slug only', () => {
    expect(stripMarkdown('See [[biology]]')).toBe('See biology')
  })
  it('strips wikilink display text', () => {
    expect(stripMarkdown('See [[biology|Life Science]]')).toBe('See Life Science')
  })
  it('strips inline code', () => {
    expect(stripMarkdown('Use `const x = 1`')).toBe('Use const x = 1')
  })
  it('strips cloze syntax to answer', () => {
    expect(stripMarkdown('ATP via {{c1::oxidative phosphorylation}}')).toBe('ATP via oxidative phosphorylation')
  })
  it('strips markdown links to label text', () => {
    expect(stripMarkdown('[click here](https://example.com)')).toBe('click here')
  })
  it('handles empty string', () => {
    expect(stripMarkdown('')).toBe('')
  })
})
```

- [ ] **Step 2: Run tests — confirm fail**

```bash
cd open-brain && npx jest tests/stripMarkdown.test.ts
```

Expected: FAIL — `Cannot find module '../lib/stripMarkdown'`

- [ ] **Step 3: Create `lib/stripMarkdown.ts`**

```ts
export function stripMarkdown(md: string): string {
  return md
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\{\{c\d+::([^}]+)\}\}/g, '$1')
    .replace(/^>\s+/gm, '')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '')
    .trim()
}
```

- [ ] **Step 4: Run tests — confirm pass**

```bash
cd open-brain && npx jest tests/stripMarkdown.test.ts
```

Expected: PASS — 9 tests

- [ ] **Step 5: Commit**

```bash
cd open-brain && git add lib/stripMarkdown.ts tests/stripMarkdown.test.ts
git commit -m "feat: add stripMarkdown utility for plain-text excerpts"
```

---

## Task 4: Create `NoteViewer.tsx`

**Files:**
- Create: `open-brain/components/editor/NoteViewer.tsx`
- Modify: `open-brain/app/globals.css`

- [ ] **Step 1: Create `components/editor/NoteViewer.tsx`**

```tsx
'use client'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'

interface Props {
  markdown: string
}

function preprocessMarkdown(md: string): string {
  return md
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '[$2](/notes/$1)')
    .replace(/\[\[([^\]|]+)\]\]/g, '[$1](/notes/$1)')
    .replace(
      /\{\{c(\d+)::([^}]+)\}\}/g,
      '<span class="cloze-highlight" data-index="$1">$2</span>'
    )
}

export function NoteViewer({ markdown }: Props) {
  return (
    <div className="prose prose-sm max-w-none dark:prose-invert">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
        {preprocessMarkdown(markdown)}
      </ReactMarkdown>
    </div>
  )
}
```

- [ ] **Step 2: Add cloze-highlight styles to `app/globals.css`**

Open `open-brain/app/globals.css` and append at the end of the file:

```css
.cloze-highlight {
  background-color: rgb(254 240 138);
  border-radius: 2px;
  padding: 0 2px;
}

.dark .cloze-highlight {
  background-color: rgb(113 63 18);
}
```

- [ ] **Step 3: Verify TypeScript compiles for NoteViewer**

```bash
cd open-brain && npx tsc --noEmit 2>&1 | grep "NoteViewer"
```

Expected: no output

- [ ] **Step 4: Commit**

```bash
cd open-brain && git add components/editor/NoteViewer.tsx app/globals.css
git commit -m "feat: add NoteViewer markdown renderer with wikilink and cloze support"
```

---

## Task 5: Create `NoteMarkdownEditor.tsx`

**Files:**
- Create: `open-brain/components/editor/NoteMarkdownEditor.tsx`

- [ ] **Step 1: Create `components/editor/NoteMarkdownEditor.tsx`**

```tsx
'use client'
import { useEffect, useRef, useState } from 'react'
import { EditorView, keymap } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { markdown } from '@codemirror/lang-markdown'
import {
  autocompletion,
  type CompletionContext,
  type CompletionResult,
} from '@codemirror/autocomplete'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import Fuse from 'fuse.js'
import { CardCreationModal } from '@/components/flashcard/CardCreationModal'

export interface AutocompleteNote {
  id: string
  title: string
  slug: string
  tags: string
}

interface Props {
  initialValue: string
  onChange: (value: string) => void
  notes: AutocompleteNote[]
  noteId: string
  className?: string
}

const editorTheme = EditorView.theme({
  '&': { fontSize: '14px', minHeight: '200px' },
  '&.cm-focused': { outline: 'none' },
  '.cm-content': { fontFamily: 'inherit', padding: '0', caretColor: 'auto' },
  '.cm-gutters': { display: 'none' },
  '.cm-line': { padding: '0' },
  '.cm-scroller': { overflow: 'auto' },
})

export function NoteMarkdownEditor({ initialValue, onChange, notes, noteId, className }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const notesRef = useRef(notes)
  const onChangeRef = useRef(onChange)
  const [cardModalOpen, setCardModalOpen] = useState(false)
  const [cardModalFront, setCardModalFront] = useState('')

  useEffect(() => { notesRef.current = notes }, [notes])
  useEffect(() => { onChangeRef.current = onChange }, [onChange])

  useEffect(() => {
    if (!containerRef.current) return

    function wikilinkCompletion(context: CompletionContext): CompletionResult | null {
      const word = context.matchBefore(/\[\[[^\]]*$/)
      if (!word) return null
      const query = word.text.slice(2)

      const searchableNotes = notesRef.current.map(n => {
        let tagList: string[] = []
        try { tagList = JSON.parse(n.tags) } catch { /* noop */ }
        return { ...n, tagList }
      })

      const fuse = new Fuse(searchableNotes, {
        keys: [{ name: 'title', weight: 0.8 }, { name: 'tagList', weight: 0.2 }],
        threshold: 0.4,
        includeScore: true,
        minMatchCharLength: 1,
      })

      const results = query.trim()
        ? fuse.search(query, { limit: 10 }).map(r => r.item)
        : searchableNotes.slice(0, 10)

      return {
        from: word.from,
        options: results.map(n => ({
          label: `[[${n.slug}]]`,
          displayLabel: n.title,
          apply: (view, _completion, from, to) => {
            view.dispatch({ changes: { from, to, insert: `[[${n.slug}]]` } })
          },
        })),
      }
    }

    const view = new EditorView({
      state: EditorState.create({
        doc: initialValue,
        extensions: [
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          markdown(),
          autocompletion({ override: [wikilinkCompletion] }),
          editorTheme,
          EditorView.updateListener.of(update => {
            if (update.docChanged) onChangeRef.current(update.state.doc.toString())
          }),
          EditorView.domEventHandlers({
            keydown(e, view) {
              if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'f') {
                e.preventDefault()
                const { from, to } = view.state.selection.main
                if (from !== to) {
                  const selected = view.state.sliceDoc(from, to)
                  setCardModalFront(selected)
                  setCardModalOpen(true)
                }
              }
            },
          }),
        ],
      }),
      parent: containerRef.current,
    })

    viewRef.current = view
    return () => view.destroy()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // intentionally empty — value/onChange/notes accessed via refs

  return (
    <>
      <div ref={containerRef} className={className} />
      <CardCreationModal
        open={cardModalOpen}
        onClose={() => setCardModalOpen(false)}
        noteId={noteId}
        initialFront={cardModalFront}
      />
    </>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd open-brain && npx tsc --noEmit 2>&1 | grep "NoteMarkdownEditor"
```

Expected: no output

- [ ] **Step 3: Commit**

```bash
cd open-brain && git add components/editor/NoteMarkdownEditor.tsx
git commit -m "feat: add NoteMarkdownEditor with CodeMirror 6, wikilink autocomplete, and ⌘⇧F shortcut"
```

---

## Task 6: Rewrite `app/notes/[slug]/page.tsx`

**Files:**
- Rewrite: `open-brain/app/notes/[slug]/page.tsx`

- [ ] **Step 1: Replace the note page with the new implementation**

Full file content for `open-brain/app/notes/[slug]/page.tsx`:

```tsx
'use client'
import { use, useRef, useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { trpc } from '@/lib/trpc'
import { NoteViewer } from '@/components/editor/NoteViewer'
import { NoteMarkdownEditor } from '@/components/editor/NoteMarkdownEditor'
import { TagInput } from '@/components/notes/TagInput'
import { BacklinksPanel } from '@/components/notes/BacklinksPanel'
import { CardsPanel } from '@/components/flashcard/CardsPanel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { ChevronLeft } from 'lucide-react'
import { extractWikilinkSlugs, extractTasks, extractClozeItems } from '@/lib/markdownExtract'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

type Mode = 'view' | 'edit'

export default function NotePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  const router = useRouter()
  const utils = trpc.useUtils()
  const titleRef = useRef<HTMLInputElement>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [mode, setMode] = useState<Mode>('view')
  const [bodyValue, setBodyValue] = useState('')
  const [bodyInitialized, setBodyInitialized] = useState(false)

  const { data: note, isLoading } = trpc.note.getBySlug.useQuery({ slug })
  const { data: notes = [] } = trpc.note.list.useQuery(undefined, { refetchInterval: 30000 })
  const notesRef = useRef(notes)
  useEffect(() => { notesRef.current = notes }, [notes])

  // Initialize bodyValue once when note loads
  useEffect(() => {
    if (note && !bodyInitialized) {
      setBodyValue(note.body ?? '')
      setBodyInitialized(true)
    }
  }, [note, bodyInitialized])

  const update = trpc.note.update.useMutation({
    onSuccess: () => {
      utils.note.list.invalidate()
      toast.success('Note saved')
    },
    onError: () => toast.error('Failed to save note'),
  })
  const syncLinks = trpc.noteLink.sync.useMutation()
  const syncTasks = trpc.task.syncFromNote.useMutation()
  const syncCloze = trpc.flashcard.syncCloze.useMutation()
  const del = trpc.note.delete.useMutation({
    onSuccess: () => router.push('/'),
  })

  const saveBody = useCallback((body: string) => {
    if (!note) return
    update.mutate({ id: note.id, body })
    const slugs = extractWikilinkSlugs(body)
    const targetNoteIds = slugs
      .map(s => notesRef.current.find(n => n.slug === s)?.id)
      .filter((id): id is string => Boolean(id))
    syncLinks.mutate({ sourceNoteId: note.id, targetNoteIds })
    const tasks = extractTasks(body)
    syncTasks.mutate({ noteId: note.id, tasks })
    const clozeItems = extractClozeItems(body)
    syncCloze.mutate({ noteId: note.id, items: clozeItems })
  }, [note, update, syncLinks, syncTasks, syncCloze])

  function handleBodyChange(newBody: string) {
    setBodyValue(newBody)
    clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => saveBody(newBody), 1000)
  }

  function handleSave() {
    if (!note) return
    const currentTitle = titleRef.current?.value
    if (currentTitle && currentTitle !== note.title) {
      update.mutate({ id: note.id, title: currentTitle })
    }
    clearTimeout(saveTimerRef.current)
    saveBody(bodyValue)
  }

  function handleModeSwitch(next: Mode) {
    if (next === mode) return
    if (mode === 'edit') {
      clearTimeout(saveTimerRef.current)
      saveBody(bodyValue)
    }
    setMode(next)
  }

  // Cleanup debounce on unmount
  useEffect(() => () => clearTimeout(saveTimerRef.current), [])

  if (isLoading) return (
    <div className="flex min-h-screen">
      <div className="flex-1 p-6 max-w-3xl">
        <Skeleton className="h-10 w-3/4 mb-4" />
        <Skeleton className="h-6 w-1/4 mb-6" />
        <div className="space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </div>
    </div>
  )

  if (!note) return <div className="p-6 text-muted-foreground">Note not found.</div>

  let tags: string[] = []
  try { tags = JSON.parse(note.tags) } catch { /* noop */ }

  return (
    <div className="flex min-h-screen">
      <div className="flex-1 p-6 max-w-3xl">
        <div className="flex items-center gap-2 mb-2">
          <Link href="/">
            <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground">
              <ChevronLeft className="h-4 w-4" />
              Notes
            </Button>
          </Link>
        </div>
        <div className="flex items-center gap-2 mb-4">
          <Input
            ref={titleRef}
            className="text-2xl font-bold border-0 shadow-none px-0 h-auto flex-1"
            defaultValue={note.title}
          />
          <div className="flex rounded-md border overflow-hidden text-sm shrink-0">
            <button
              className={`px-3 py-1 ${mode === 'view' ? 'bg-accent font-medium' : 'hover:bg-accent/50'}`}
              onClick={() => handleModeSwitch('view')}
            >
              View
            </button>
            <button
              className={`px-3 py-1 border-l ${mode === 'edit' ? 'bg-accent font-medium' : 'hover:bg-accent/50'}`}
              onClick={() => handleModeSwitch('edit')}
            >
              Edit
            </button>
          </div>
          <Button size="sm" onClick={handleSave} disabled={update.isPending}>
            {update.isPending ? 'Saving…' : 'Save'}
          </Button>
          <Link href={`/graph?focus=${note.id}`}>
            <Button variant="outline" size="sm">Graph</Button>
          </Link>
          <AlertDialog>
            <AlertDialogTrigger render={<Button variant="destructive" size="sm" />}>
              Delete
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete note?</AlertDialogTitle>
                <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => del.mutate({ id: note.id })}>Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
        <TagInput
          tags={tags}
          onChange={t => update.mutate({ id: note.id, tags: JSON.stringify(t) })}
        />
        <div className="mt-4">
          {mode === 'view' ? (
            <NoteViewer markdown={bodyValue} />
          ) : (
            <NoteMarkdownEditor
              initialValue={bodyValue}
              onChange={handleBodyChange}
              noteId={note.id}
              notes={notes.map(({ id, title, slug: noteSlug, tags }) => ({ id, title, slug: noteSlug, tags }))}
            />
          )}
        </div>
      </div>
      <div className="w-72 shrink-0 border-l flex flex-col divide-y">
        <BacklinksPanel noteId={note.id} />
        <CardsPanel noteId={note.id} />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd open-brain && npx tsc --noEmit 2>&1 | grep -v "node_modules"
```

Expected: no errors (or only pre-existing errors unrelated to this change)

- [ ] **Step 3: Commit**

```bash
cd open-brain && git add "app/notes/[slug]/page.tsx"
git commit -m "feat: add view/edit mode toggle and markdown save logic to note page"
```

---

## Task 7: Update server-side code

**Files:**
- Modify: `open-brain/server/routers/noteLink.ts`
- Modify: `open-brain/server/routers/note.ts`

- [ ] **Step 1: Update `server/routers/noteLink.ts` — replace TipTap JSON excerpt**

At the top of `server/routers/noteLink.ts`, add the import:

```ts
import { stripMarkdown } from '@/lib/stripMarkdown'
```

In `getBacklinks`, replace the excerpt extraction block:

```ts
// REMOVE:
let excerpt = ''
try {
  excerpt = (JSON.parse(l.sourceNote.body)?.content?.[0]?.content?.[0]?.text ?? '').slice(0, 100)
} catch { /* noop */ }
return {
  id: l.sourceNote.id,
  title: l.sourceNote.title,
  slug: l.sourceNote.slug,
  excerpt,
}

// REPLACE WITH:
return {
  id: l.sourceNote.id,
  title: l.sourceNote.title,
  slug: l.sourceNote.slug,
  excerpt: stripMarkdown(l.sourceNote.body ?? '').slice(0, 100),
}
```

- [ ] **Step 2: Update `server/routers/note.ts` — fix periodic note default body**

In `getOrCreatePeriodic`, replace the TipTap JSON default body:

```ts
// REMOVE:
const body = template?.content && template.content !== '{}'
  ? template.content
  : JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }] })

// REPLACE WITH:
const body = template?.content && template.content !== '{}'
  ? template.content
  : ''
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd open-brain && npx tsc --noEmit 2>&1 | grep -v "node_modules"
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
cd open-brain && git add server/routers/noteLink.ts server/routers/note.ts
git commit -m "fix: use stripMarkdown for backlink excerpts; empty string for periodic note default body"
```

---

## Task 8: Update notes list excerpt in `app/page.tsx`

**Files:**
- Modify: `open-brain/app/page.tsx`

- [ ] **Step 1: Add `stripMarkdown` import to `app/page.tsx`**

At the top of `open-brain/app/page.tsx`, add:

```ts
import { stripMarkdown } from '@/lib/stripMarkdown'
```

- [ ] **Step 2: Replace the TipTap JSON excerpt extraction**

Find this block in `app/page.tsx`:

```tsx
let excerpt = ''
try {
  excerpt = JSON.parse(note.body)?.content?.[0]?.content?.[0]?.text?.slice(0, 120) ?? ''
} catch { /* noop */ }
```

Replace with:

```tsx
const excerpt = stripMarkdown(note.body ?? '').slice(0, 120)
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd open-brain && npx tsc --noEmit 2>&1 | grep -v "node_modules"
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
cd open-brain && git add app/page.tsx
git commit -m "fix: use stripMarkdown for notes list excerpt"
```

---

## Task 9: Remove TipTap files and packages

**Files:**
- Delete: `open-brain/components/editor/NoteEditor.tsx`
- Delete: `open-brain/components/editor/WikilinkAutocomplete.tsx`
- Delete: `open-brain/components/editor/extensions/WikilinkExtension.ts`
- Delete: `open-brain/components/editor/extensions/TaskItemExtension.ts`
- Delete: `open-brain/components/editor/extensions/ClozeExtension.ts`
- Delete: `open-brain/components/editor/extensions/__tests__/WikilinkExtension.test.ts`
- Delete: `open-brain/tests/wikilink-serializer.test.ts`
- Delete: `open-brain/tests/cloze-serializer.test.ts`

- [ ] **Step 1: Confirm no remaining imports of deleted files**

```bash
cd open-brain && grep -r "NoteEditor\|WikilinkAutocomplete\|WikilinkExtension\|TaskItemExtension\|ClozeExtension\|@tiptap" \
  --include="*.ts" --include="*.tsx" \
  --exclude-dir="node_modules" \
  --exclude="NoteEditor.tsx" \
  --exclude="WikilinkAutocomplete.tsx" \
  --exclude-dir="extensions" \
  .
```

Expected: no output (all imports have been removed)

- [ ] **Step 2: Delete TipTap component files**

```bash
cd open-brain && rm components/editor/NoteEditor.tsx \
  components/editor/WikilinkAutocomplete.tsx \
  components/editor/extensions/WikilinkExtension.ts \
  components/editor/extensions/TaskItemExtension.ts \
  components/editor/extensions/ClozeExtension.ts \
  components/editor/extensions/__tests__/WikilinkExtension.test.ts \
  tests/wikilink-serializer.test.ts \
  tests/cloze-serializer.test.ts
```

- [ ] **Step 3: Uninstall TipTap packages**

```bash
cd open-brain && npm uninstall @tiptap/extension-placeholder @tiptap/extension-task-item @tiptap/extension-task-list @tiptap/react @tiptap/starter-kit
```

- [ ] **Step 4: Full TypeScript compile check**

```bash
cd open-brain && npx tsc --noEmit 2>&1 | grep -v "node_modules"
```

Expected: no errors

- [ ] **Step 5: Run all tests**

```bash
cd open-brain && npx jest
```

Expected: all tests pass — includes markdownExtract (9 tests) and stripMarkdown (9 tests); wikilink-serializer and cloze-serializer tests are gone

- [ ] **Step 6: Commit**

```bash
cd open-brain && git add -A
git commit -m "feat: remove TipTap — markdown view/edit mode migration complete"
```
