import { Node, mergeAttributes, InputRule } from '@tiptap/core'

export const WikilinkExtension = Node.create({
  name: 'wikilink',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      noteId: { default: null },
      title: { default: '' },
      resolved: { default: false },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-wikilink]' }]
  },

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
})

export function extractWikilinks(doc: { type: string; content?: any[]; attrs?: Record<string, any> }): string[] {
  const ids: string[] = []
  const traverse = (node: any) => {
    if (node.type === 'wikilink' && node.attrs?.noteId) {
      ids.push(node.attrs.noteId)
    }
    if (node.content) node.content.forEach(traverse)
  }
  traverse(doc)
  return ids
}
