import TurndownService from 'turndown'

const td = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
})

td.remove(['script', 'style', 'nav', 'figure', 'sup'])

export function htmlToMarkdown(html: string): string {
  return td.turndown(html)
}
