jest.mock('react-markdown', () => ({ __esModule: true, default: () => null }))
jest.mock('remark-gfm', () => ({ __esModule: true, default: () => {} }))

import {
  isWikipediaFileUrl,
  markHiddenPassages,
} from '../components/reading/ExtractHighlighter'

describe('markHiddenPassages', () => {
  it('hides a single-paragraph passage', () => {
    const md = 'Hello world.'
    const { md: result } = markHiddenPassages(md, ['Hello world.'])
    expect(result).not.toContain('Hello world.')
    expect(result).toContain('1 passage hidden')
  })

  it('hides a cross-paragraph passage', () => {
    const md = 'End of one.\n\nStart of two.'
    const passage = 'End of one. Start of two.'
    const { md: result, restoreMap } = markHiddenPassages(md, [passage])
    expect(result).not.toContain('End of one.')
    expect(result).not.toContain('Start of two.')
    expect(result).toContain('1 passage hidden')
    expect(Object.values(restoreMap)).toEqual([[passage]])
  })

  it('returns unchanged markdown when no passage matches', () => {
    const md = 'Some content here.'
    const { md: result } = markHiddenPassages(md, ['not present'])
    expect(result).toBe(md)
  })

  it('hides multiple independent passages', () => {
    const md = 'First. Middle. Last.'
    const { md: result } = markHiddenPassages(md, ['First.', 'Last.'])
    expect(result).not.toContain('First.')
    expect(result).not.toContain('Last.')
    expect(result).toContain('Middle.')
  })
})

describe('isWikipediaFileUrl', () => {
  it('returns true for File: namespace URLs', () => {
    expect(isWikipediaFileUrl('https://en.wikipedia.org/wiki/File:Foo.svg')).toBe(true)
    expect(isWikipediaFileUrl('https://en.wikipedia.org/wiki/file:Bar.png')).toBe(true)
  })

  it('returns false for regular article URLs', () => {
    expect(isWikipediaFileUrl('https://en.wikipedia.org/wiki/Mitochondria')).toBe(false)
  })

  it('returns false for non-Wikipedia URLs', () => {
    expect(isWikipediaFileUrl('https://example.com/wiki/File:Foo.svg')).toBe(false)
  })

  it('returns false for non-URL strings', () => {
    expect(isWikipediaFileUrl('not-a-url')).toBe(false)
  })
})
