import { htmlToMarkdown } from './htmlToMarkdown'

export interface WikipediaSection {
  sectionTitle: string
  content: string
  articleUrl: string
}

export function extractWikipediaTitleFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (!parsed.hostname.endsWith('wikipedia.org')) return null
    const parts = parsed.pathname.split('/')
    const wikiIndex = parts.indexOf('wiki')
    if (wikiIndex === -1 || wikiIndex + 1 >= parts.length) return null
    return decodeURIComponent(parts[wikiIndex + 1])
  } catch {
    return null
  }
}

interface ParseSection {
  toclevel: number
  level?: string
  line: string
  number?: string
  index?: string
  anchor: string
}

interface MwParseResponse {
  parse?: {
    title: string
    displaytitle?: string
    text: string
    sections: ParseSection[]
  }
  error?: { code: string; info?: string }
}

// Legacy mobile-sections REST shape. The endpoint was decommissioned in 2026
// (T328036). The parser is retained so older fixtures/mocks keep working.
interface MobileSectionsResponse {
  lead?: { displaytitle?: string; sections?: Array<{ id: number; text: string }> }
  remaining?: {
    sections?: Array<{ id: number; anchor: string; line: string; text: string }>
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function stripHtmlTags(s: string): string {
  return s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
}

function stripBalancedTag(html: string, tag: string, classPattern: RegExp): string {
  const openRe = new RegExp(
    `<${tag}\\b[^>]*\\bclass="[^"]*${classPattern.source}[^"]*"[^>]*>`,
    'i'
  )
  const openAny = new RegExp(`<${tag}\\b`, 'gi')
  const closeAny = new RegExp(`</${tag}\\s*>`, 'gi')
  let out = html
  let guard = 0
  while (guard++ < 10000) {
    const start = openRe.exec(out)
    if (!start) break
    const startIdx = start.index
    let i = startIdx + start[0].length
    let depth = 1
    while (depth > 0 && i < out.length) {
      openAny.lastIndex = i
      closeAny.lastIndex = i
      const openMatch = openAny.exec(out)
      const closeMatch = closeAny.exec(out)
      if (!closeMatch) return out.slice(0, startIdx)
      if (openMatch && openMatch.index < closeMatch.index) {
        depth++
        i = openMatch.index + openMatch[0].length
      } else {
        depth--
        i = closeMatch.index + closeMatch[0].length
      }
    }
    out = out.slice(0, startIdx) + out.slice(i)
  }
  return out
}

function absolutizeWikipediaLinks(html: string, articleUrl: string): string {
  let origin: string
  try {
    origin = new URL(articleUrl).origin
  } catch {
    origin = 'https://en.wikipedia.org'
  }
  return html.replace(
    /(<a\b[^>]*\bhref=")(\/(?:wiki|w)\/[^"]*)(")/gi,
    (_m, pre: string, path: string, post: string) => `${pre}${origin}${path}${post}`
  )
}

function sanitizeSectionHtml(html: string, articleUrl: string): string {
  let out = stripBalancedTag(html, 'span', /\bmw-editsection\b/)
  out = stripBalancedTag(out, 'table', /\bnavbox\b/)
  out = absolutizeWikipediaLinks(out, articleUrl)
  return out
}

function parseFromActionApi(
  response: MwParseResponse,
  articleUrl: string
): WikipediaSection[] {
  const parse = response.parse
  if (!parse) return []
  const html = parse.text
  const topLevel = parse.sections.filter((s) => s.toclevel === 1)
  const matches: Array<{ line: string; start: number; afterH2: number }> = []
  for (const s of topLevel) {
    const re = new RegExp(`<h2[^>]*\\bid="${escapeRegex(s.anchor)}"[^>]*>[\\s\\S]*?</h2>`)
    const m = re.exec(html)
    if (!m) continue
    matches.push({ line: s.line, start: m.index, afterH2: m.index + m[0].length })
  }
  matches.sort((a, b) => a.start - b.start)

  const sections: WikipediaSection[] = []
  const leadEnd = matches.length > 0 ? matches[0].start : html.length
  const leadHtml = sanitizeSectionHtml(html.slice(0, leadEnd), articleUrl).trim()
  if (leadHtml) {
    sections.push({
      sectionTitle: 'Introduction',
      content: htmlToMarkdown(leadHtml),
      articleUrl,
    })
  }
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].afterH2
    const end = i + 1 < matches.length ? matches[i + 1].start : html.length
    const body = sanitizeSectionHtml(html.slice(start, end), articleUrl).trim()
    if (!body) continue
    sections.push({
      sectionTitle: stripHtmlTags(matches[i].line) || matches[i].line,
      content: htmlToMarkdown(body),
      articleUrl,
    })
  }
  return sections
}

function parseFromMobileSections(
  response: MobileSectionsResponse,
  articleUrl: string
): WikipediaSection[] {
  const sections: WikipediaSection[] = []
  const leadSection = response.lead?.sections?.[0]
  if (leadSection) {
    sections.push({
      sectionTitle: 'Introduction',
      content: htmlToMarkdown(leadSection.text),
      articleUrl,
    })
  }
  for (const section of response.remaining?.sections ?? []) {
    if (!section.text?.trim()) continue
    sections.push({
      sectionTitle: section.line || section.anchor,
      content: htmlToMarkdown(section.text),
      articleUrl,
    })
  }
  return sections
}

export function parseWikipediaSections(
  response: MwParseResponse | MobileSectionsResponse,
  articleUrl: string
): WikipediaSection[] {
  if ('parse' in response && response.parse) {
    return parseFromActionApi(response as MwParseResponse, articleUrl)
  }
  return parseFromMobileSections(response as MobileSectionsResponse, articleUrl)
}

const USER_AGENT =
  'OpenBrain/1.0 (https://github.com/shwcsmack/open-brain; self-hosted PKM)'

export async function fetchWikipediaSections(
  titleOrUrl: string,
  fetchFn: typeof fetch = fetch
): Promise<WikipediaSection[]> {
  const title = titleOrUrl.startsWith('http')
    ? extractWikipediaTitleFromUrl(titleOrUrl)
    : titleOrUrl.trim()

  if (!title) throw new Error('Invalid Wikipedia URL')

  const params = new URLSearchParams({
    action: 'parse',
    page: title,
    prop: 'text|sections|displaytitle',
    format: 'json',
    formatversion: '2',
    redirects: '1',
  })
  const url = `https://en.wikipedia.org/w/api.php?${params.toString()}`
  let res: Response
  try {
    res = await fetchFn(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    })
  } catch {
    throw new Error(
      'Failed to reach Wikipedia. Check your network connection and try again.'
    )
  }

  if (res.status === 404) throw new Error(`Wikipedia article not found: ${title}`)
  if (!res.ok) throw new Error(`Wikipedia API error: ${res.status}`)

  const data = (await res.json()) as MwParseResponse | MobileSectionsResponse
  if ('error' in data && data.error) {
    if (data.error.code === 'missingtitle') {
      throw new Error(`Wikipedia article not found: ${title}`)
    }
    throw new Error(`Wikipedia API error: ${data.error.info || data.error.code}`)
  }
  const articleUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`
  return parseWikipediaSections(data, articleUrl)
}
