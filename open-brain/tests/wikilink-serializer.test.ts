import { extractWikilinks } from '@/components/editor/extensions/WikilinkExtension'

describe('WikilinkExtension serializer', () => {
  it('extracts noteIds from wikilink nodes', () => {
    const doc = {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [
          { type: 'wikilink', attrs: { title: 'Test', noteId: 'note-123', resolved: true } },
        ],
      }],
    }
    expect(extractWikilinks(doc)).toEqual(['note-123'])
  })

  it('skips unresolved wikilinks (null noteId)', () => {
    const doc = {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [
          { type: 'wikilink', attrs: { title: 'Unknown', noteId: null, resolved: false } },
        ],
      }],
    }
    expect(extractWikilinks(doc)).toEqual([])
  })

  it('returns empty for doc with no wikilinks', () => {
    const doc = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }],
    }
    expect(extractWikilinks(doc)).toEqual([])
  })

  it('extracts multiple wikilinks from a single paragraph', () => {
    const doc = {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [
          { type: 'wikilink', attrs: { title: 'A', noteId: 'id-1', resolved: true } },
          { type: 'text', text: ' and ' },
          { type: 'wikilink', attrs: { title: 'B', noteId: 'id-2', resolved: true } },
        ],
      }],
    }
    expect(extractWikilinks(doc)).toEqual(['id-1', 'id-2'])
  })

  it('traverses nested content', () => {
    const doc = {
      type: 'doc',
      content: [{
        type: 'bulletList',
        content: [{
          type: 'listItem',
          content: [{
            type: 'paragraph',
            content: [{ type: 'wikilink', attrs: { noteId: 'nested-id', title: 'Nested', resolved: true } }],
          }],
        }],
      }],
    }
    expect(extractWikilinks(doc)).toEqual(['nested-id'])
  })
})
