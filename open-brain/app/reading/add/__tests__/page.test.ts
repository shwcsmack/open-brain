import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Wikipedia auto-add on /reading/add is implemented in a client page with tRPC
 * hooks; jsdom + full render is not in the test harness. Source-shape tests pin
 * the useEffect guard and removal of the manual preview/confirm flow.
 */
describe('ReadingAddPage Wikipedia auto-add invariants', () => {
  const src = readFileSync(join(__dirname, '..', 'page.tsx'), 'utf8')

  test('auto-add useEffect runs when fetch data arrives and mutation is idle', () => {
    expect(src).toContain('wikiQuery.data && addWikipedia.isIdle')
    expect(src).toContain('addWikipedia.mutate(wikiQuery.data)')
    expect(src).toMatch(/\[wikiQuery\.data,\s*addWikipedia\.isIdle\]/)
  })

  test('Wikipedia preview panel and manual add handler are removed', () => {
    expect(src).not.toContain('showWikiPreview')
    expect(src).not.toContain('handleAddWholeArticle')
    expect(src).not.toContain('Add whole article to queue')
    expect(src).not.toContain('const wikiArticle = wikiQuery.data')
  })

  test('addWikipedia mutation resets on clear and new submit so failed saves can retry', () => {
    const resetUrlFlow = src.slice(
      src.indexOf('function resetUrlFlow'),
      src.indexOf('function handleUrlSubmit'),
    )
    const handleUrlSubmit = src.slice(
      src.indexOf('function handleUrlSubmit'),
      src.indexOf('function handleConfirmUrlPreview'),
    )
    expect(resetUrlFlow).toContain('addWikipedia.reset()')
    expect(handleUrlSubmit).toContain('addWikipedia.reset()')
  })
})

describe('ReadingAddPage URL flow race guards', () => {
  const src = readFileSync(join(__dirname, '..', 'page.tsx'), 'utf8')

  test('isUrlFlowBusy covers fetch and save pending states', () => {
    expect(src).toMatch(
      /const isUrlFlowBusy\s*=\s*isFetching\s*\|\|\s*addWikipedia\.isPending\s*\|\|\s*addUrl\.isPending/,
    )
  })

  test('handleUrlSubmit returns early before reset while URL flow is busy', () => {
    const handleUrlSubmit = src.slice(
      src.indexOf('function handleUrlSubmit'),
      src.indexOf('function handleConfirmUrlPreview'),
    )
    expect(handleUrlSubmit).toMatch(/if\s*\(\s*isUrlFlowBusy\s*\)\s*return/)
    expect(handleUrlSubmit.indexOf('if (isUrlFlowBusy) return')).toBeLessThan(
      handleUrlSubmit.indexOf('addWikipedia.reset()'),
    )
  })

  test('submit and clear buttons disable while URL flow is busy', () => {
    const formSection = src.slice(
      src.indexOf('<form onSubmit={handleUrlSubmit}'),
      src.indexOf('</form>', src.indexOf('<form onSubmit={handleUrlSubmit}')),
    )
    const submitButton = formSection.slice(
      formSection.indexOf('<Button type="submit"'),
      formSection.indexOf('</Button>', formSection.indexOf('<Button type="submit"')),
    )
    const clearButton = formSection.slice(
      formSection.indexOf('onClick={resetUrlFlow}'),
      formSection.indexOf('</Button>', formSection.indexOf('onClick={resetUrlFlow}')),
    )
    expect(submitButton).toContain('disabled={!urlInput.trim() || isUrlFlowBusy}')
    expect(clearButton).toContain('disabled={isUrlFlowBusy}')
  })
})

describe('ReadingAddPage Wikipedia loading indicator', () => {
  const src = readFileSync(join(__dirname, '..', 'page.tsx'), 'utf8')

  test('uses Loader2 spinner for Wikipedia fetch and save phases', () => {
    expect(src).toMatch(/import\s*\{[^}]*Loader2[^}]*\}\s*from\s*['"]lucide-react['"]/)
    expect(src).toContain('Loader2')
    expect(src).toMatch(
      /isWikiFetch\s*&&\s*\(\s*wikiQuery\.isFetching\s*\|\|\s*addWikipedia\.isPending\s*\)/,
    )
    expect(src).toContain('Fetching Wikipedia article…')
    expect(src).toContain('Saving to reading queue…')
    expect(src).toMatch(/wikiQuery\.isFetching[\s\S]*Fetching Wikipedia article/)
    expect(src).toMatch(/addWikipedia\.isPending[\s\S]*Saving to reading queue/)
  })

  test('keeps Skeleton loader for non-Wikipedia preview fetch only', () => {
    expect(src).toMatch(/!isWikiFetch\s*&&\s*isFetching/)
    expect(src).toContain('<Skeleton')
  })
})

describe('ReadingAddPage submit button label', () => {
  const src = readFileSync(join(__dirname, '..', 'page.tsx'), 'utf8')

  test('submit button label depends on urlInput Wikipedia detection', () => {
    const submitButton = src.slice(
      src.indexOf('<Button type="submit"'),
      src.indexOf('</Button>', src.indexOf('<Button type="submit"')),
    )
    expect(submitButton).toContain("isEnWikipediaUrl(urlInput)")
    expect(submitButton).toMatch(
      /isEnWikipediaUrl\(urlInput\)\s*\?\s*['"]Add to queue['"]\s*:\s*['"]Fetch preview['"]/,
    )
  })
})
