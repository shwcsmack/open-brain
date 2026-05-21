import {
  extractWikilinks,
  getWikilinkDisplay,
  wikilinkAttrsFromBracketMatch,
  WIKILINK_INPUT_RULE_PATTERN,
} from '../WikilinkExtension'

describe('getWikilinkDisplay', () => {
  test('non-aliased resolved chip', () => {
    const result = getWikilinkDisplay({ displayText: null, title: 'Biology', resolved: true })
    expect(result.text).toBe('[[Biology]]')
    expect(result.className).toBe('wikilink wikilink-resolved')
    expect(result.tooltip).toBeNull()
  })

  test('aliased chip shows tilde prefix and tooltip', () => {
    const result = getWikilinkDisplay({ displayText: 'ascent', title: 'Our Subaru Ascent', resolved: true })
    expect(result.text).toBe('~ascent')
    expect(result.className).toBe('wikilink wikilink-resolved wikilink-aliased')
    expect(result.tooltip).toBe('→ Our Subaru Ascent')
  })

  test('non-aliased unresolved chip', () => {
    const result = getWikilinkDisplay({ displayText: null, title: 'Missing Note', resolved: false })
    expect(result.text).toBe('[[Missing Note]]')
    expect(result.className).toBe('wikilink wikilink-unresolved')
    expect(result.tooltip).toBeNull()
  })

  test('aliased unresolved chip gets aliased class', () => {
    const result = getWikilinkDisplay({ displayText: 'car', title: 'Nonexistent Note', resolved: false })
    expect(result.text).toBe('~car')
    expect(result.className).toBe('wikilink wikilink-unresolved wikilink-aliased')
    expect(result.tooltip).toBe('→ Nonexistent Note')
  })
})

test('extractWikilinks ignores displayText — backlinks key off noteId', () => {
  const doc = {
    type: 'doc',
    content: [{
      type: 'paragraph',
      content: [{
        type: 'wikilink',
        attrs: { noteId: 'abc-123', title: 'Our Subaru Ascent', resolved: true, displayText: 'ascent' },
      }],
    }],
  }
  expect(extractWikilinks(doc)).toEqual(['abc-123'])
})

describe('wikilink InputRule', () => {
  test('[[Our Subaru Ascent|ascent]] sets title and displayText', () => {
    const match = '[[Our Subaru Ascent|ascent]]'.match(WIKILINK_INPUT_RULE_PATTERN)
    expect(match).not.toBeNull()
    expect(wikilinkAttrsFromBracketMatch(match!)).toEqual({
      title: 'Our Subaru Ascent',
      displayText: 'ascent',
      resolved: false,
    })
  })

  test('[[Biology]] leaves displayText null', () => {
    const match = '[[Biology]]'.match(WIKILINK_INPUT_RULE_PATTERN)
    expect(match).not.toBeNull()
    expect(wikilinkAttrsFromBracketMatch(match!)).toEqual({
      title: 'Biology',
      displayText: null,
      resolved: false,
    })
  })
})

test('extracts resolved wikilink IDs', () => {
  const doc = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'wikilink', attrs: { noteId: 'abc-123', title: 'Biology', resolved: true } },
          { type: 'text', text: ' some text ' },
          { type: 'wikilink', attrs: { noteId: null, title: 'Missing', resolved: false } },
        ],
      },
    ],
  }
  expect(extractWikilinks(doc)).toEqual(['abc-123'])
})

test('returns empty array for doc with no wikilinks', () => {
  const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }] }
  expect(extractWikilinks(doc)).toEqual([])
})

test('handles nested content', () => {
  const doc = {
    type: 'doc',
    content: [{
      type: 'bulletList',
      content: [{
        type: 'listItem',
        content: [{
          type: 'paragraph',
          content: [{ type: 'wikilink', attrs: { noteId: 'xyz', title: 'Test', resolved: true } }]
        }]
      }]
    }]
  }
  expect(extractWikilinks(doc)).toEqual(['xyz'])
})
