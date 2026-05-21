import { Node, mergeAttributes, InputRule } from '@tiptap/core'

export const ClozeExtension = Node.create({
  name: 'cloze',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      index: { default: 1 },
      answer: { default: '' },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-cloze]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-cloze': '',
        class:
          'cloze-blank bg-yellow-100 border border-yellow-400 rounded px-1 text-yellow-800 font-mono text-sm',
      }),
      `[...${HTMLAttributes.answer}]`,
    ]
  },

  addInputRules() {
    return [
      new InputRule({
        find: /\{\{c(\d+)::([^}]+)\}\}$/,
        handler: ({ state, range, match }) => {
          const [, indexStr, answer] = match
          const node = state.schema.nodes.cloze.create({
            index: parseInt(indexStr, 10),
            answer,
          })
          state.tr.replaceRangeWith(range.from, range.to, node)
        },
      }),
    ]
  },
})

// Serializer: extract all cloze nodes from Tiptap JSON
export interface ClozeItem {
  front: string // the full paragraph text with [...] placeholder for the cloze
  clozeIndex: number
  answer: string
}

export function extractClozeItems(doc: Record<string, unknown>): ClozeItem[] {
  const items: ClozeItem[] = []

  function walk(node: Record<string, unknown>) {
    if (node.type === 'paragraph' && Array.isArray(node.content)) {
      const content = node.content as Array<Record<string, unknown>>
      const clozeNodes = content.filter((n) => n.type === 'cloze')
      if (clozeNodes.length > 0) {
        const front = content
          .map((n) => {
            if (n.type === 'text') return n.text as string
            if (n.type === 'cloze') return '[...]'
            return ''
          })
          .join('')
        clozeNodes.forEach((cn) => {
          const attrs = cn.attrs as Record<string, unknown>
          items.push({
            front,
            clozeIndex: attrs.index as number,
            answer: attrs.answer as string,
          })
        })
      }
    }
    if (Array.isArray(node.content)) {
      ;(node.content as Array<Record<string, unknown>>).forEach(walk)
    }
  }

  walk(doc)
  return items
}
