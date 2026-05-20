import { extractWikilinks } from '../WikilinkExtension'

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
