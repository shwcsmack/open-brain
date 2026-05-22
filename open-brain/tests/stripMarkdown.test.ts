import { stripMarkdown } from '../lib/stripMarkdown'

describe('stripMarkdown', () => {
  it('returns empty string for empty input', () => {
    expect(stripMarkdown('')).toBe('')
  })

  it('removes ATX heading markers', () => {
    expect(stripMarkdown('# Heading')).toBe('Heading')
    expect(stripMarkdown('### Sub heading')).toBe('Sub heading')
  })

  it('removes bold markers (**)', () => {
    expect(stripMarkdown('This is **bold** text')).toBe('This is bold text')
  })

  it('removes italic markers (*)', () => {
    expect(stripMarkdown('This is *italic* text')).toBe('This is italic text')
  })

  it('removes bold markers (__)', () => {
    expect(stripMarkdown('This is __bold__ text')).toBe('This is bold text')
  })

  it('removes italic markers (_)', () => {
    expect(stripMarkdown('This is _italic_ text')).toBe('This is italic text')
  })

  it('replaces [[slug]] wikilinks with the slug', () => {
    expect(stripMarkdown('See [[biology]] for more.')).toBe('See biology for more.')
  })

  it('replaces [[slug|Display]] wikilinks with the display text', () => {
    expect(stripMarkdown('See [[biology|Life Science]] for more.')).toBe(
      'See Life Science for more.',
    )
  })

  it('removes inline code backticks', () => {
    expect(stripMarkdown('Use `npm install` to install.')).toBe('Use npm install to install.')
  })

  it('replaces cloze {{cN::answer}} with the answer', () => {
    expect(stripMarkdown('ATP via {{c1::oxidative phosphorylation}}.')).toBe(
      'ATP via oxidative phosphorylation.',
    )
  })

  it('replaces markdown links [label](url) with the label', () => {
    expect(stripMarkdown('See [the docs](https://example.com) for more.')).toBe(
      'See the docs for more.',
    )
  })

  it('removes blockquote markers', () => {
    expect(stripMarkdown('> a quoted line')).toBe('a quoted line')
  })

  it('strips heading markers inside a blockquote', () => {
    expect(stripMarkdown('> # Title')).toBe('Title')
  })

  it('strips unordered list markers inside a blockquote', () => {
    expect(stripMarkdown('> - item')).toBe('item')
  })

  it('strips ordered list markers inside a blockquote', () => {
    expect(stripMarkdown('> 1. item')).toBe('item')
  })

  it('handles nested blockquotes with a heading', () => {
    expect(stripMarkdown('>> # Title')).toBe('Title')
  })

  it('removes unordered list markers', () => {
    expect(stripMarkdown('- item one')).toBe('item one')
    expect(stripMarkdown('* item two')).toBe('item two')
    expect(stripMarkdown('+ item three')).toBe('item three')
  })

  it('removes ordered list markers', () => {
    expect(stripMarkdown('1. first item')).toBe('first item')
    expect(stripMarkdown('10. tenth item')).toBe('tenth item')
  })

  it('strips GFM unchecked task list markers', () => {
    expect(stripMarkdown('- [ ] task')).toBe('task')
  })

  it('strips GFM checked task list markers (lowercase x)', () => {
    expect(stripMarkdown('- [x] done')).toBe('done')
  })

  it('strips GFM checked task list markers (uppercase X)', () => {
    expect(stripMarkdown('- [X] done')).toBe('done')
  })

  it('strips ordered GFM task list markers', () => {
    expect(stripMarkdown('1. [ ] numbered task')).toBe('numbered task')
  })

  it('handles a multi-line document combining several constructs', () => {
    const md = [
      '# Title',
      '',
      'A paragraph with **bold**, *italic*, `code`, a [[note|link]], and a [site](https://example.com).',
      '',
      '> a quote',
      '',
      '- one',
      '- two',
      '',
      'Cloze: {{c1::answer}}',
    ].join('\n')

    const result = stripMarkdown(md)

    expect(result).toContain('Title')
    expect(result).toContain('A paragraph with bold, italic, code, a link, and a site.')
    expect(result).toContain('a quote')
    expect(result).toContain('one')
    expect(result).toContain('two')
    expect(result).toContain('Cloze: answer')
    expect(result).not.toMatch(/[#*_`>]|\[\[|\]\]|\{\{|}}/)
  })
})
