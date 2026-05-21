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

export const WIKILINK_INPUT_RULE_PATTERN = /\[\[([^\]|]+)(?:\|([^\]]*))?\]\]$/

export function wikilinkAttrsFromBracketMatch(match: RegExpMatchArray): {
  title: string
  displayText: string | null
  resolved: false
} {
  return {
    title: match[1],
    displayText: match[2] ?? null,
    resolved: false,
  }
}

export function getWikilinkDisplay(attrs: {
  displayText: string | null
  title: string
  resolved: boolean
}): { text: string; className: string; tooltip: string | null } {
  const isAliased = !!attrs.displayText
  return {
    text: isAliased ? `~${attrs.displayText}` : `[[${attrs.title}]]`,
    className: [
      'wikilink',
      attrs.resolved ? 'wikilink-resolved' : 'wikilink-unresolved',
      ...(isAliased ? ['wikilink-aliased'] : []),
    ].join(' '),
    tooltip: isAliased ? `→ ${attrs.title}` : null,
  }
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
      displayText: { default: null },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-wikilink]' }]
  },

  renderHTML({ HTMLAttributes }) {
    const { text, className, tooltip } = getWikilinkDisplay({
      displayText: HTMLAttributes.displayText ?? null,
      title: HTMLAttributes.title,
      resolved: HTMLAttributes.resolved,
    })
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-wikilink': '',
        class: className,
        ...(tooltip ? { title: tooltip } : {}),
      }),
      text,
    ]
  },

  addInputRules() {
    return [
      new InputRule({
        find: WIKILINK_INPUT_RULE_PATTERN,
        handler: ({ state, range, match }) => {
          const attrs = wikilinkAttrsFromBracketMatch(match)
          const { tr } = state
          tr.replaceWith(
            range.from,
            range.to,
            state.schema.nodes.wikilink.create(attrs)
          )
        },
      }),
    ]
  },

  addNodeView() {
    return ({ node }: { node: { attrs: { displayText: string | null; title: string; resolved: boolean; noteSlug: string | null } } }) => {
      const dom = document.createElement('span')
      dom.setAttribute('data-wikilink', '')
      const { text, className, tooltip } = getWikilinkDisplay({
        displayText: node.attrs.displayText ?? null,
        title: node.attrs.title,
        resolved: node.attrs.resolved,
      })
      dom.className = className
      dom.textContent = text
      if (tooltip) dom.title = tooltip
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
