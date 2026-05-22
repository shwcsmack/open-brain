'use client'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface Props {
  markdown: string
}

// Hardened character classes mirror `extractWikilinkSlugs` semantics: a slug
// cannot contain `[`, `]`, or `|`, and display text cannot contain `[` or `]`.
// This prevents a malformed `[[foo` from greedily swallowing a later
// well-formed `[[bar]]` on the same line.
const WIKILINK_ALIASED = /\[\[([^\]\[|]+)\|([^\]\[]+)\]\]/g
const WIKILINK_PLAIN = /\[\[([^\]\[|]+)\]\]/g
const CLOZE_RE = /\{\{c(\d+)::([^}]+)\}\}/g

export function preprocessWikilinks(md: string): string {
  return md
    .replace(WIKILINK_ALIASED, (_m, slug: string, display: string) => {
      const target = slug.trim()
      return `[${display}](/notes/${target})`
    })
    .replace(WIKILINK_PLAIN, (_m, slug: string) => {
      const target = slug.trim()
      return `[${target}](/notes/${target})`
    })
}

// Minimal local hast node typings. We avoid `@types/hast` because it is not a
// direct dependency; the shapes below cover the fields we touch.
interface HastText {
  type: 'text'
  value: string
}
interface HastElement {
  type: 'element'
  tagName: string
  properties?: Record<string, unknown>
  children: HastChild[]
}
interface HastRoot {
  type: 'root'
  children: HastChild[]
}
type HastChild = HastText | HastElement | { type: string; children?: HastChild[] }

// Tags whose text content should NOT be searched for cloze tokens (verbatim
// content like code blocks should render as-is).
const SKIP_TAGS = new Set(['code', 'pre', 'script', 'style'])

function transformClozeText(value: string): HastChild[] | null {
  if (!value.includes('{{c')) return null
  const re = new RegExp(CLOZE_RE.source, 'g')
  const out: HastChild[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = re.exec(value)) !== null) {
    if (match.index > lastIndex) {
      out.push({ type: 'text', value: value.slice(lastIndex, match.index) })
    }
    const [, idx, answer] = match
    out.push({
      type: 'element',
      tagName: 'span',
      properties: {
        className: ['cloze-highlight'],
        'data-cloze-index': idx,
      },
      // Answer is placed as a TEXT node child, never parsed as HTML. This
      // means content like `<script>` inside a cloze answer is escaped on
      // render rather than executed.
      children: [{ type: 'text', value: answer }],
    })
    lastIndex = match.index + match[0].length
  }
  if (out.length === 0) return null
  if (lastIndex < value.length) {
    out.push({ type: 'text', value: value.slice(lastIndex) })
  }
  return out
}

function walkHast(node: HastChild | HastRoot): void {
  const children = (node as { children?: HastChild[] }).children
  if (!Array.isArray(children)) return
  for (let i = 0; i < children.length; i++) {
    const child = children[i]
    if (child.type === 'text') {
      const replaced = transformClozeText((child as HastText).value)
      if (replaced) {
        children.splice(i, 1, ...replaced)
        i += replaced.length - 1
      }
      continue
    }
    if (
      child.type === 'element' &&
      SKIP_TAGS.has((child as HastElement).tagName)
    ) {
      continue
    }
    walkHast(child)
  }
}

// Rehype plugin: converts `{{cN::answer}}` text tokens inside the parsed hast
// tree into `<span class="cloze-highlight" data-cloze-index="N">answer</span>`
// elements. This is scoped to the cloze pattern only — no raw HTML from the
// markdown source is parsed or rendered, which is why we no longer need
// `rehype-raw`.
export function rehypeCloze() {
  return (tree: HastRoot): HastRoot => {
    walkHast(tree)
    return tree
  }
}

export function NoteViewer({ markdown }: Props) {
  return (
    <div className="prose prose-sm max-w-none dark:prose-invert">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeCloze]}
      >
        {preprocessWikilinks(markdown)}
      </ReactMarkdown>
    </div>
  )
}
