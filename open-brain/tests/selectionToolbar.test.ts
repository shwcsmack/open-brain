jest.mock('react-markdown', () => ({ __esModule: true, default: () => null }))
jest.mock('remark-gfm', () => ({ __esModule: true, default: () => {} }))

import { buildPlainTextMap } from '../components/reading/ExtractHighlighter'
import {
  computePassageRangeFromSelection,
  getPlainTextOffset,
  tryGetPlainTextOffset,
} from '../components/reading/plainTextOffset'

const TEXT = 3
const ELEMENT = 1

type MockNode = {
  nodeType: number
  tagName?: string
  textContent?: string
  childNodes: MockNode[]
  parentNode: MockNode | null
  getAttribute: (name: string) => string | null
  contains: (node: unknown) => boolean
}

function text(value: string, parent: MockNode | null = null): MockNode {
  const node: MockNode = {
    nodeType: TEXT,
    textContent: value,
    childNodes: [],
    parentNode: parent,
    getAttribute: () => null,
    contains: (other) => other === node,
  }
  return node
}

function el(
  attrs: Record<string, string>,
  children: MockNode[],
  parent: MockNode | null = null,
  tagName = 'DIV',
): MockNode {
  const node: MockNode = {
    nodeType: ELEMENT,
    tagName,
    childNodes: children,
    parentNode: parent,
    getAttribute: (name) => attrs[name] ?? null,
    contains(other) {
      if (other === node) return true
      return children.some((c) => c.contains(other))
    },
  }
  for (const child of children) child.parentNode = node
  return node
}

function container(children: MockNode[]): MockNode {
  return el({}, children)
}

describe('plain-text offset walking', () => {
  it('returns offset within a single text node', () => {
    const root = container([text('Hello world')])
    expect(tryGetPlainTextOffset(root as unknown as Element, root.childNodes[0] as unknown as Node, 6)).toBe(6)
    expect(getPlainTextOffset(root as unknown as Element, root.childNodes[0] as unknown as Node, 6)).toBe(6)
  })

  it('returns offset across multiple text nodes', () => {
    const root = container([text('Hello '), text('world')])
    const first = root.childNodes[0]
    const second = root.childNodes[1]
    expect(tryGetPlainTextOffset(root as unknown as Element, first as unknown as Node, 6)).toBe(6)
    expect(tryGetPlainTextOffset(root as unknown as Element, second as unknown as Node, 3)).toBe(9)
  })

  it('handles element boundary endpoints with child-index offsets', () => {
    const a = text('aa')
    const b = text('bb')
    const root = container([a, b])
    expect(tryGetPlainTextOffset(root as unknown as Element, root as unknown as Node, 1)).toBe(2)
    expect(tryGetPlainTextOffset(root as unknown as Element, root as unknown as Node, 2)).toBe(4)
  })

  it('skips elements marked data-plain-offset-ignore', () => {
    const visible = text('link')
    const ignored = el({ 'data-plain-offset-ignore': 'true' }, [text(' +')])
    const root = container([visible, ignored])
    expect(tryGetPlainTextOffset(root as unknown as Element, visible as unknown as Node, 4)).toBe(4)
    expect(tryGetPlainTextOffset(root as unknown as Element, ignored as unknown as Node, 0)).toBeNull()
    expect(tryGetPlainTextOffset(root as unknown as Element, ignored.childNodes[0] as unknown as Node, 0)).toBeNull()
    expect(getPlainTextOffset(root as unknown as Element, ignored as unknown as Node, 0)).toBe(-1)
  })

  it('counts tombstone placeholders as original hidden range length', () => {
    const before = text('ab')
    const tombstone = el({ 'data-plain-start': '10', 'data-plain-end': '20' }, [
      text('1 passage hidden'),
      el({}, [text('Restore')]),
    ])
    const after = text('cd')
    const root = container([before, tombstone, after])

    expect(tryGetPlainTextOffset(root as unknown as Element, before as unknown as Node, 2)).toBe(2)
    expect(tryGetPlainTextOffset(root as unknown as Element, tombstone as unknown as Node, 0)).toBe(2)
    expect(tryGetPlainTextOffset(root as unknown as Element, tombstone as unknown as Node, 2)).toBe(12)
    expect(tryGetPlainTextOffset(root as unknown as Element, after as unknown as Node, 0)).toBe(12)
    expect(tryGetPlainTextOffset(root as unknown as Element, after as unknown as Node, 2)).toBe(14)
    expect(tryGetPlainTextOffset(root as unknown as Element, tombstone.childNodes[0] as unknown as Node, 0)).toBeNull()
  })

  it('fails closed when endpoint is outside the container', () => {
    const root = container([text('inside')])
    const outside = text('outside')
    expect(tryGetPlainTextOffset(root as unknown as Element, outside as unknown as Node, 0)).toBeNull()
  })

  it('ignores structural newline text nodes between paragraphs (buildPlainTextMap contract)', () => {
    const md = 'End of one.\n\nStart of two.'
    const { plainText } = buildPlainTextMap(md)
    expect(plainText).toBe('End of one.Start of two.')

    const p1 = el({}, [text('End of one.')], null, 'P')
    const structuralNewline = text('\n')
    const p2 = el({}, [text('Start of two.')], null, 'P')
    const root = container([p1, structuralNewline, p2])

    const secondParaText = p2.childNodes[0]!
    expect(tryGetPlainTextOffset(root as unknown as Element, secondParaText as unknown as Node, 0)).toBe(
      'End of one.'.length,
    )
  })

  it('still counts whitespace inside a paragraph', () => {
    const p = el({}, [text('a b')], null, 'P')
    const root = container([p])
    const textNode = p.childNodes[0]!
    expect(tryGetPlainTextOffset(root as unknown as Element, textNode as unknown as Node, 2)).toBe(2)
  })
})

describe('computePassageRangeFromSelection', () => {
  function mockRange(toStringValue: string, startContainer: Node, startOffset: number, endContainer: Node, endOffset: number): Range {
    return {
      toString: () => toStringValue,
      startContainer,
      startOffset,
      endContainer,
      endOffset,
    } as Range
  }

  it('trims leading and trailing whitespace to match toolbar selection', () => {
    const root = container([text('  hello world  ')])
    const textNode = root.childNodes[0]
    const range = mockRange('  hello  ', textNode as unknown as Node, 2, textNode as unknown as Node, 9)
    expect(computePassageRangeFromSelection(root as unknown as Element, range)).toEqual({
      start: 4,
      end: 7,
    })
  })
})
