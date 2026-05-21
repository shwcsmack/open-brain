import { Node, mergeAttributes, InputRule } from '@tiptap/core'

type PeriodType = 'DAY' | 'WEEK' | 'MONTH' | 'QUARTER' | 'YEAR'

function parsePeriodicWikilink(title: string): { periodType: PeriodType; periodKey: string } | null {
  if (/^daily\/\d{4}-\d{2}-\d{2}$/.test(title)) return { periodType: 'DAY', periodKey: title.slice(6) }
  if (/^weekly\/\d{4}-W\d{2}$/.test(title)) return { periodType: 'WEEK', periodKey: title.slice(7) }
  if (/^monthly\/\d{4}-\d{2}$/.test(title)) return { periodType: 'MONTH', periodKey: title.slice(8) }
  if (/^quarterly\/\d{4}-Q[1-4]$/.test(title)) return { periodType: 'QUARTER', periodKey: title.slice(10) }
  if (/^yearly\/\d{4}$/.test(title)) return { periodType: 'YEAR', periodKey: title.slice(7) }
  return null
}

export const WikilinkExtension = Node.create({
  name: 'wikilink',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      noteId: { default: null },
      noteSlug: { default: null },
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

  addNodeView() {
    return ({ node, HTMLAttributes }) => {
      const dom = document.createElement('span')
      dom.setAttribute('data-wikilink', '')
      dom.className = node.attrs.resolved
        ? 'wikilink wikilink-resolved'
        : 'wikilink wikilink-unresolved'
      dom.textContent = `[[${node.attrs.title}]]`
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
