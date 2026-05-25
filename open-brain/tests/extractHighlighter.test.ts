jest.mock('react-markdown', () => ({ __esModule: true, default: () => null }))
jest.mock('remark-gfm', () => ({ __esModule: true, default: () => {} }))

import { preprocessWikilinks } from '../components/editor/NoteViewer'
import {
  isWikipediaFileUrl,
  markHiddenPassages,
  buildPlainTextMap,
} from '../components/reading/ExtractHighlighter'
import { tombstonePlainBounds } from '../components/reading/plainTextOffset'

describe('buildPlainTextMap', () => {
  it('maps plain text positions to markdown positions for plain text', () => {
    const { plainText, offsets } = buildPlainTextMap('Hello world.')
    expect(plainText).toBe('Hello world.')
    expect(offsets[0]).toBe(0) // 'H' is at markdown pos 0
    expect(offsets[6]).toBe(6) // 'w' is at markdown pos 6
    expect(offsets[11]).toBe(11) // '.' is at markdown pos 11
  })

  it('skips bold markers (**) from offsets', () => {
    const { plainText, offsets } = buildPlainTextMap('**bold**')
    expect(plainText).toBe('bold')
    expect(offsets[0]).toBe(2) // 'b' at markdown pos 2 (after **)
    expect(offsets[3]).toBe(5) // 'd' at markdown pos 5
  })

  it('skips italic markers (_) from offsets', () => {
    const { plainText, offsets } = buildPlainTextMap('_italic_')
    expect(plainText).toBe('italic')
    expect(offsets[0]).toBe(1)
    expect(offsets[5]).toBe(6)
  })

  it('skips link syntax and URL from offsets', () => {
    const { plainText, offsets } = buildPlainTextMap('[text](https://example.com)')
    expect(plainText).toBe('text')
    expect(offsets[0]).toBe(1) // 't' at markdown pos 1 (after '[')
    expect(offsets[3]).toBe(4) // 't' at markdown pos 4
  })

  it('handles plain text before and after bold', () => {
    const { plainText, offsets } = buildPlainTextMap('The **cell** is')
    expect(plainText).toBe('The cell is')
    expect(offsets[0]).toBe(0) // 'T'
    expect(offsets[4]).toBe(6) // 'c' (after "The **")
    expect(offsets[8]).toBe(12) // ' ' (text node " is" starts at 12)
    expect(offsets[9]).toBe(13) // 'i'
  })

  it('concatenates paragraph text nodes without a separator', () => {
    const md = 'End of one.\n\nStart of two.'
    const { plainText } = buildPlainTextMap(md)
    expect(plainText).toBe('End of one.Start of two.')
  })
})

describe('markHiddenPassages', () => {
  it('hides a single passage by plain-text offset', () => {
    const { md: result } = markHiddenPassages('Hello world.', [{ start: 0, end: 5 }])
    expect(result).not.toContain('Hello')
    expect(result).toContain('1 passage hidden')
    expect(result).toContain('world.')
  })

  it('hides only the correct occurrence when text repeats', () => {
    const md = 'yes no yes'
    const { md: result } = markHiddenPassages(md, [{ start: 0, end: 3 }])
    expect(result).not.toMatch(/^yes/)
    expect(result).toContain('yes') // second occurrence still present
    expect(result).toContain('1 passage hidden')
  })

  it('hides a passage from bold-formatted content', () => {
    const md = '**The cell** is here'
    const { md: result } = markHiddenPassages(md, [{ start: 0, end: 8 }])
    expect(result).not.toContain('The cell')
    expect(result).toContain('1 passage hidden')
    expect(result).toContain('is here')
  })

  it('hides a cross-paragraph passage', () => {
    const md = 'End of one.\n\nStart of two.'
    const { plainText } = buildPlainTextMap(md)
    const { md: result, restoreMap } = markHiddenPassages(md, [
      { start: 0, end: plainText.length },
    ])
    expect(result).not.toContain('End of one.')
    expect(result).not.toContain('Start of two.')
    expect(result).toContain('1 passage hidden')
    expect(Object.values(restoreMap)).toEqual([[{ start: 0, end: plainText.length }]])
  })

  it('returns unchanged markdown when range has no matching content', () => {
    const md = 'Some content here.'
    const { md: result } = markHiddenPassages(md, [{ start: 999, end: 1010 }])
    expect(result).toBe(md)
  })

  it('hides multiple passages', () => {
    const md = 'First. Middle. Last.'
    const { md: result } = markHiddenPassages(md, [
      { start: 0, end: 6 },
      { start: 15, end: 20 },
    ])
    expect(result).not.toContain('First.')
    expect(result).not.toContain('Last.')
    expect(result).toContain('Middle.')
  })

  it('restoreMap contains the { start, end } pairs for each group', () => {
    const md = 'Hello world.'
    const { restoreMap } = markHiddenPassages(md, [{ start: 0, end: 5 }])
    const groups = Object.values(restoreMap)
    expect(groups).toHaveLength(1)
    expect(groups[0]).toEqual([{ start: 0, end: 5 }])
  })

  it('deduplicates identical { start, end } entries in a merged tombstone group', () => {
    const md = 'Hello world.'
    const duplicate = { start: 0, end: 5 }
    const { restoreMap } = markHiddenPassages(md, [duplicate, duplicate])
    expect(Object.values(restoreMap)).toEqual([[duplicate]])
  })

  it('hides wikilink display text using rendered plain-text offsets', () => {
    const md = preprocessWikilinks('See [[biology]] today.')
    const { plainText } = buildPlainTextMap(md)
    expect(plainText).toBe('See biology today.')
    const start = plainText.indexOf('biology')
    const end = start + 'biology'.length
    const { md: result } = markHiddenPassages(md, [{ start, end }])
    expect(result).not.toContain('[biology]')
    expect(result).toContain('1 passage hidden')
    expect(buildPlainTextMap(result).plainText).toBe('See 1 passage hidden today.')
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

describe('tombstonePlainBounds', () => {
  it('uses min start and max end across grouped passages', () => {
    expect(
      tombstonePlainBounds([
        { start: 40, end: 50 },
        { start: 10, end: 25 },
      ]),
    ).toEqual({ plainStart: 10, plainEnd: 50 })
  })
})
