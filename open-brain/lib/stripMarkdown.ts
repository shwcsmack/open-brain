export function stripMarkdown(md: string): string {
  if (!md) return ''

  let out = md

  out = out.replace(/```[\s\S]*?```/g, (block) =>
    block
      .replace(/^```[^\n]*\n?/, '')
      .replace(/```$/, '')
      .trim(),
  )

  out = out.replace(/\{\{c\d+::([^}]+)\}\}/g, '$1')

  out = out.replace(/\[\[([^\]\[|]+)\|([^\]\[]+)\]\]/g, '$2')
  out = out.replace(/\[\[([^\]\[|]+)\]\]/g, (_match, slug: string) => slug.trim())

  out = out.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
  out = out.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')

  let prev: string
  do {
    prev = out
    out = out.replace(/^[ \t]*>+[ \t]?/gm, '')
  } while (out !== prev)

  out = out.replace(/^\s{0,3}#{1,6}\s+/gm, '')

  out = out.replace(/^\s*[-*+]\s+\[[ xX]\]\s+/gm, '')
  out = out.replace(/^\s*\d+\.\s+\[[ xX]\]\s+/gm, '')
  out = out.replace(/^\s*[-*+]\s+/gm, '')
  out = out.replace(/^\s*\d+\.\s+/gm, '')

  out = out.replace(/(\*\*|__)(\S(?:.*?\S)?)\1/g, '$2')
  out = out.replace(/(?<![*\w])\*(?!\s)([^*\n]+?)(?<!\s)\*(?!\w)/g, '$1')
  out = out.replace(/(?<![_\w])_(?!\s)([^_\n]+?)(?<!\s)_(?!\w)/g, '$1')

  out = out.replace(/`([^`\n]+)`/g, '$1')

  out = out.replace(/[ \t]+\n/g, '\n')
  out = out.replace(/\n{3,}/g, '\n\n')

  return out
}
