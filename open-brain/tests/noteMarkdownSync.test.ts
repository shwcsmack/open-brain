import { resolveTargetNoteIds } from '../lib/wikilinkResolve'

describe('resolveTargetNoteIds', () => {
  it('returns ids for slugs that resolve, dedupes, and preserves first-seen order', () => {
    const slugToId = new Map<string, string>([
      ['alpha', 'id-1'],
      ['beta', 'id-2'],
      ['gamma', 'id-3'],
    ])

    const result = resolveTargetNoteIds(
      ['beta', 'alpha', 'beta', 'gamma', 'alpha'],
      slugToId,
    )

    expect(result).toEqual(['id-2', 'id-1', 'id-3'])
  })

  it('drops slugs that have no entry in the map (unresolved wikilinks)', () => {
    const slugToId = new Map<string, string>([['known', 'id-1']])

    const result = resolveTargetNoteIds(
      ['known', 'missing', 'daily/2026-01-01', 'known'],
      slugToId,
    )

    expect(result).toEqual(['id-1'])
  })

  it('returns empty array when no slugs are provided', () => {
    expect(resolveTargetNoteIds([], new Map())).toEqual([])
  })

  it('returns empty array when none of the slugs are in the map', () => {
    const slugToId = new Map<string, string>([['only', 'id-x']])
    expect(resolveTargetNoteIds(['a', 'b', 'c'], slugToId)).toEqual([])
  })

  it('treats empty-string ids in the map as unresolved', () => {
    const slugToId = new Map<string, string>([
      ['blank', ''],
      ['real', 'id-real'],
    ])
    expect(resolveTargetNoteIds(['blank', 'real'], slugToId)).toEqual(['id-real'])
  })
})
