import { extractClozeItems } from '@/components/editor/extensions/ClozeExtension'

describe('ClozeExtension serializer', () => {
  it('extracts a single cloze item', () => {
    const doc = {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [
          { type: 'text', text: 'The capital of France is ' },
          { type: 'cloze', attrs: { index: 1, answer: 'Paris' } },
          { type: 'text', text: '.' },
        ],
      }],
    }
    const items = extractClozeItems(doc)
    expect(items).toHaveLength(1)
    expect(items[0].clozeIndex).toBe(1)
    expect(items[0].answer).toBe('Paris')
    expect(items[0].front).toBe('The capital of France is [...].')
  })

  it('handles multi-cloze paragraph with per-card front', () => {
    const doc = {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [
          { type: 'cloze', attrs: { index: 1, answer: 'capital' } },
          { type: 'text', text: ' of France is ' },
          { type: 'cloze', attrs: { index: 2, answer: 'Paris' } },
        ],
      }],
    }
    const items = extractClozeItems(doc)
    expect(items).toHaveLength(2)
    // c1 front: [...] of France is Paris
    expect(items[0].front).toBe('[...] of France is Paris')
    expect(items[0].answer).toBe('capital')
    // c2 front: capital of France is [...]
    expect(items[1].front).toBe('capital of France is [...]')
    expect(items[1].answer).toBe('Paris')
  })

  it('returns empty for doc with no cloze nodes', () => {
    const doc = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'plain text' }] }],
    }
    expect(extractClozeItems(doc)).toHaveLength(0)
  })

  it('handles cloze nodes across multiple paragraphs', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Water boils at ' },
            { type: 'cloze', attrs: { index: 1, answer: '100°C' } },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Ice melts at ' },
            { type: 'cloze', attrs: { index: 1, answer: '0°C' } },
          ],
        },
      ],
    }
    const items = extractClozeItems(doc)
    expect(items).toHaveLength(2)
    expect(items[0].answer).toBe('100°C')
    expect(items[1].answer).toBe('0°C')
  })
})
