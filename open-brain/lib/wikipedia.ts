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

interface MobileSectionsResponse {
  lead: {
    displaytitle: string
    sections: Array<{ id: number; text: string }>
  }
  remaining: {
    sections: Array<{ id: number; anchor: string; line: string; text: string }>
  }
}

export function parseWikipediaSections(
  response: MobileSectionsResponse,
  articleUrl: string
): WikipediaSection[] {
  const sections: WikipediaSection[] = []

  const leadSection = response.lead.sections[0]
  if (leadSection) {
    sections.push({
      sectionTitle: 'Introduction',
      content: htmlToMarkdown(leadSection.text),
      articleUrl,
    })
  }

  for (const section of response.remaining.sections) {
    if (!section.text?.trim()) continue
    sections.push({
      sectionTitle: section.line || section.anchor,
      content: htmlToMarkdown(section.text),
      articleUrl,
    })
  }

  return sections
}

export async function fetchWikipediaSections(
  titleOrUrl: string,
  fetchFn: typeof fetch = fetch
): Promise<WikipediaSection[]> {
  const title = titleOrUrl.startsWith('http')
    ? extractWikipediaTitleFromUrl(titleOrUrl)
    : titleOrUrl.trim()

  if (!title) throw new Error('Invalid Wikipedia URL')

  const url = `https://en.wikipedia.org/api/rest_v1/page/mobile-sections/${encodeURIComponent(title)}`
  let res: Response
  try {
    res = await fetchFn(url, {
      headers: { 'User-Agent': 'OpenBrain/1.0 (self-hosted PKM)' },
    })
  } catch {
    throw new Error('Failed to reach Wikipedia. Check your network connection and try again.')
  }

  if (res.status === 404) throw new Error(`Wikipedia article not found: ${title}`)
  if (!res.ok) throw new Error(`Wikipedia API error: ${res.status}`)

  const data = (await res.json()) as MobileSectionsResponse
  const articleUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`
  return parseWikipediaSections(data, articleUrl)
}
