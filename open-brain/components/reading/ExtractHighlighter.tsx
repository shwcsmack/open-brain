'use client'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { preprocessWikilinks } from '@/components/editor/NoteViewer'

interface Props {
  markdown: string
  extractedTexts: string[]
  onAddWikipediaLink?: (url: string) => void
}

function isWikipediaUrl(href: string): boolean {
  try {
    return new URL(href).hostname.endsWith('wikipedia.org')
  } catch {
    return false
  }
}

function markExtracts(markdown: string, extracts: string[]): string {
  let result = markdown
  for (const text of extracts) {
    const normalized = text.replace(/\s+/g, ' ').trim()
    if (!normalized) continue
    const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(`(${escaped})`, 'gi')
    result = result.replace(re, '~~$1~~')
  }
  return result
}

export function ExtractHighlighter({ markdown, extractedTexts, onAddWikipediaLink }: Props) {
  const processedMarkdown =
    extractedTexts.length > 0 ? markExtracts(markdown, extractedTexts) : markdown

  return (
    <div className="prose prose-sm max-w-none dark:prose-invert">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => {
            const wiki = href && isWikipediaUrl(href)
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline"
                title={wiki && onAddWikipediaLink ? 'Add Wikipedia article to reading queue' : undefined}
                onClick={e => {
                  if (!wiki || !onAddWikipediaLink || !href) return
                  e.preventDefault()
                  e.stopPropagation()
                  onAddWikipediaLink(href)
                }}
              >
                {children}
              </a>
            )
          },
          del: ({ children }) => (
            <span className="bg-yellow-100/60 text-yellow-900/60 line-through dark:bg-yellow-900/20">
              {children}
            </span>
          ),
        }}
      >
        {preprocessWikilinks(processedMarkdown)}
      </ReactMarkdown>
    </div>
  )
}
