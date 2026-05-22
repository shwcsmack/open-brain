import { readFileSync } from 'node:fs'
import { join } from 'node:path'

jest.mock('react-markdown', () => ({ __esModule: true, default: () => null }))
jest.mock('remark-gfm', () => ({ __esModule: true, default: () => {} }))

import { preprocessWikilinks, rehypeCloze } from '../NoteViewer'

// Local lightweight hast-ish helpers for building synthetic trees in tests.
type HastNode = {
  type: string
  value?: string
  tagName?: string
  properties?: Record<string, unknown>
  children?: HastNode[]
}

function root(children: HastNode[]): HastNode {
  return { type: 'root', children }
}
function el(tagName: string, children: HastNode[] = []): HastNode {
  return { type: 'element', tagName, properties: {}, children }
}
function text(value: string): HastNode {
  return { type: 'text', value }
}

describe('preprocessWikilinks', () => {
  test('[[slug]] becomes [slug](/notes/slug)', () => {
    expect(preprocessWikilinks('See [[biology]] today.')).toBe(
      'See [biology](/notes/biology) today.',
    )
  })

  test('[[slug|display]] becomes [display](/notes/slug)', () => {
    expect(preprocessWikilinks('Check [[bio|Biology]] notes.')).toBe(
      'Check [Biology](/notes/bio) notes.',
    )
  })

  test('display text does not affect slug target', () => {
    expect(preprocessWikilinks('[[the-slug|Pretty Name]]')).toBe(
      '[Pretty Name](/notes/the-slug)',
    )
  })

  test('multiple wikilinks on one line are all replaced', () => {
    expect(preprocessWikilinks('[[a]] and [[b|B-link]]')).toBe(
      '[a](/notes/a) and [B-link](/notes/b)',
    )
  })

  test('malformed wikilink does not consume a later valid one', () => {
    expect(preprocessWikilinks('[[foo and [[bar]] here')).toBe(
      '[[foo and [bar](/notes/bar) here',
    )
  })

  test('trims slug whitespace', () => {
    expect(preprocessWikilinks('[[  slug  ]]')).toBe('[slug](/notes/slug)')
  })

  test('does not touch cloze tokens (cloze handled by rehype plugin)', () => {
    expect(preprocessWikilinks('foo {{c1::answer}} bar')).toBe(
      'foo {{c1::answer}} bar',
    )
  })

  test('does not introduce raw HTML when no wikilinks present', () => {
    const md = 'plain markdown with <script>alert(1)</script> raw html'
    expect(preprocessWikilinks(md)).toBe(md)
  })
})

describe('rehypeCloze transform', () => {
  function runPlugin(tree: HastNode): HastNode {
    rehypeCloze()(tree as never)
    return tree
  }

  test('splits a single cloze token into text + span element', () => {
    const tree = root([el('p', [text('ATP via {{c1::oxidative phosphorylation}}.')])])
    runPlugin(tree)
    const para = tree.children![0]
    expect(para.children).toHaveLength(3)
    expect(para.children![0]).toEqual({ type: 'text', value: 'ATP via ' })
    expect(para.children![1]).toEqual({
      type: 'element',
      tagName: 'span',
      properties: {
        className: ['cloze-highlight'],
        'data-cloze-index': '1',
      },
      children: [{ type: 'text', value: 'oxidative phosphorylation' }],
    })
    expect(para.children![2]).toEqual({ type: 'text', value: '.' })
  })

  test('handles multiple cloze tokens on the same line', () => {
    const tree = root([el('p', [text('{{c1::A}} and {{c2::B}}')])])
    runPlugin(tree)
    const para = tree.children![0]
    expect(para.children).toHaveLength(3)
    expect((para.children![0] as HastNode).tagName).toBe('span')
    expect((para.children![0] as HastNode).properties).toEqual({
      className: ['cloze-highlight'],
      'data-cloze-index': '1',
    })
    expect((para.children![1] as HastNode).value).toBe(' and ')
    expect((para.children![2] as HastNode).properties).toEqual({
      className: ['cloze-highlight'],
      'data-cloze-index': '2',
    })
  })

  test('cloze answer is stored as a TEXT child, not parsed as HTML', () => {
    // This is the safety property. With rehype-raw removed, react-markdown
    // renders text children as escaped text, so `<script>` cannot execute.
    const tree = root([
      el('p', [text('{{c1::<script>alert("x")</script>}}')]),
    ])
    runPlugin(tree)
    const span = tree.children![0].children![0] as HastNode
    expect(span.tagName).toBe('span')
    expect(span.children).toHaveLength(1)
    expect(span.children![0]).toEqual({
      type: 'text',
      value: '<script>alert("x")</script>',
    })
  })

  test('recurses into nested elements', () => {
    const tree = root([
      el('ul', [el('li', [el('p', [text('See {{c3::answer}}')])])]),
    ])
    runPlugin(tree)
    const p = tree.children![0].children![0].children![0]
    expect(p.children).toHaveLength(2)
    expect((p.children![1] as HastNode).tagName).toBe('span')
    expect((p.children![1] as HastNode).properties).toEqual({
      className: ['cloze-highlight'],
      'data-cloze-index': '3',
    })
  })

  test('does not transform cloze tokens inside <code> or <pre>', () => {
    const tree = root([
      el('pre', [el('code', [text('{{c1::not transformed}}')])]),
    ])
    runPlugin(tree)
    const code = tree.children![0].children![0]
    expect(code.children).toHaveLength(1)
    expect((code.children![0] as HastNode).type).toBe('text')
    expect((code.children![0] as HastNode).value).toBe('{{c1::not transformed}}')
  })

  test('leaves text without cloze tokens untouched', () => {
    const tree = root([el('p', [text('just plain text')])])
    runPlugin(tree)
    expect(tree.children![0].children).toEqual([
      { type: 'text', value: 'just plain text' },
    ])
  })

  test('does NOT manufacture elements from HTML-looking text', () => {
    // The plugin must ONLY match the cloze pattern. Text that looks like
    // HTML (e.g. `<span>raw</span>` typed in a note) is left as a single
    // text node — react-markdown without rehype-raw will then render it as
    // escaped text, NOT as DOM elements.
    const tree = root([
      el('p', [text('Hello <script>alert(1)</script> <span>raw</span>')]),
    ])
    runPlugin(tree)
    expect(tree.children![0].children).toEqual([
      {
        type: 'text',
        value: 'Hello <script>alert(1)</script> <span>raw</span>',
      },
    ])
  })
})

describe('NoteViewer source no longer depends on rehype-raw', () => {
  // The previous implementation passed `rehype-raw` to react-markdown, which
  // parsed any raw HTML in the note source. This test guards the file from
  // regressing back to that behavior.
  const src = readFileSync(
    join(__dirname, '..', 'NoteViewer.tsx'),
    'utf8',
  )

  test('does not import rehype-raw', () => {
    expect(src).not.toMatch(/from\s+['"]rehype-raw['"]/)
  })

  test('does not reference rehypeRaw identifier', () => {
    expect(src).not.toMatch(/\brehypeRaw\b/)
  })
})
