import { toSlug } from '../slug'

test('converts title to kebab-case slug', () => {
  expect(toSlug('Hello World!')).toBe('hello-world')
})
test('handles special characters', () => {
  expect(toSlug('C++ Notes')).toBe('c-notes')
})
test('collapses multiple spaces and dashes', () => {
  expect(toSlug('  foo   bar  ')).toBe('foo-bar')
})
test('empty string returns empty', () => {
  expect(toSlug('')).toBe('')
})
