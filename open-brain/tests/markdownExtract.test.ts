import { extractWikilinkSlugs, extractTasks, extractClozeItems } from '../lib/markdownExtract'

describe('extractWikilinkSlugs', () => {
  it('extracts a single slug', () => {
    expect(extractWikilinkSlugs('See [[biology]].')).toEqual(['biology'])
  })
  it('extracts slug from [[slug|display]]', () => {
    expect(extractWikilinkSlugs('See [[biology|Life Science]].')).toEqual(['biology'])
  })
  it('extracts multiple slugs', () => {
    expect(extractWikilinkSlugs('[[a]] and [[b]]')).toEqual(['a', 'b'])
  })
  it('returns empty for no wikilinks', () => {
    expect(extractWikilinkSlugs('No links here.')).toEqual([])
  })
  it('trims whitespace around slugs', () => {
    expect(extractWikilinkSlugs('See [[  biology  ]].')).toEqual(['biology'])
  })
  it('ignores unterminated wikilink (missing closing brackets)', () => {
    expect(extractWikilinkSlugs('See [[biology')).toEqual([])
  })
  it('ignores unterminated wikilink with single trailing bracket', () => {
    expect(extractWikilinkSlugs('See [[biology]')).toEqual([])
  })
  it('ignores unfinished alias without closing brackets', () => {
    expect(extractWikilinkSlugs('See [[biology|Life Science')).toEqual([])
  })
  it('ignores unfinished alias with pipe but no closing brackets', () => {
    expect(extractWikilinkSlugs('See [[biology|')).toEqual([])
  })
  it('mixes well-formed and malformed, extracting only well-formed', () => {
    expect(extractWikilinkSlugs('See [[good]] and [[broken')).toEqual(['good'])
  })
  it('does not let a malformed opener consume a later valid link', () => {
    expect(extractWikilinkSlugs('See [[broken and [[good]]')).toEqual(['good'])
  })
  it('does not let a malformed alias consume a later valid link', () => {
    expect(extractWikilinkSlugs('See [[broken|alias and [[good]]')).toEqual(['good'])
  })
})

describe('extractTasks', () => {
  it('extracts unchecked task', () => {
    expect(extractTasks('- [ ] Buy groceries')).toEqual([{ title: 'Buy groceries', done: false }])
  })
  it('extracts checked task', () => {
    expect(extractTasks('- [x] Buy groceries')).toEqual([{ title: 'Buy groceries', done: true }])
  })
  it('extracts multiple tasks', () => {
    const md = '- [ ] Task A\n- [x] Task B'
    expect(extractTasks(md)).toEqual([
      { title: 'Task A', done: false },
      { title: 'Task B', done: true },
    ])
  })
  it('ignores non-task lines', () => {
    expect(extractTasks('paragraph\n- [ ] Real task')).toEqual([{ title: 'Real task', done: false }])
  })
  it('treats uppercase [X] as not done (only lowercase x counts as done)', () => {
    expect(extractTasks('- [X] Capital X')).toEqual([])
  })
  it('returns empty array when input has no task lines', () => {
    expect(extractTasks('Just a paragraph\nwith multiple lines\nbut no tasks.')).toEqual([])
  })
})

describe('extractClozeItems', () => {
  it('extracts a single cloze item', () => {
    const md = 'ATP via {{c1::oxidative phosphorylation}}'
    expect(extractClozeItems(md)).toEqual([
      { front: md, clozeIndex: 1, answer: 'oxidative phosphorylation' },
    ])
  })
  it('extracts multiple cloze items with same front', () => {
    const md = '{{c1::A}} and {{c2::B}}'
    expect(extractClozeItems(md)).toEqual([
      { front: md, clozeIndex: 1, answer: 'A' },
      { front: md, clozeIndex: 2, answer: 'B' },
    ])
  })
  it('returns empty when no cloze', () => {
    expect(extractClozeItems('No cloze here.')).toEqual([])
  })
})
