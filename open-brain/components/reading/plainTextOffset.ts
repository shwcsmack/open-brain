const PLAIN_OFFSET_IGNORE = 'data-plain-offset-ignore'
const PLAIN_START = 'data-plain-start'
const PLAIN_END = 'data-plain-end'

const TEXT_NODE = 3
const ELEMENT_NODE = 1

/** Block-level tags ReactMarkdown emits as siblings of structural whitespace text nodes. */
const BLOCK_LEVEL_TAGS = new Set([
  'P',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'UL',
  'OL',
  'BLOCKQUOTE',
  'PRE',
  'HR',
  'TABLE',
  'DIV',
  'ARTICLE',
  'SECTION',
])

function isBlockLevelElement(el: Element): boolean {
  return BLOCK_LEVEL_TAGS.has(el.tagName)
}

/**
 * Whitespace-only text nodes inserted between block elements (e.g. "\n" between
 * <p> siblings under the markdown wrapper). buildPlainTextMap does not include these.
 */
function isStructuralWhitespaceText(node: Node, container: Element): boolean {
  if (node.nodeType !== TEXT_NODE) return false
  const text = node.textContent ?? ''
  if (!/^\s*$/.test(text)) return false

  const parent = node.parentNode
  if (!parent || parent.nodeType !== ELEMENT_NODE) return false
  const parentEl = parent as Element
  if (!container.contains(parentEl)) return false

  const siblings = Array.from(parentEl.childNodes)
  if (!siblings.some((sibling) => sibling === node)) return false

  return siblings.some(
    (sibling) => sibling.nodeType === ELEMENT_NODE && isBlockLevelElement(sibling as Element),
  )
}

function parsePlainRange(el: Element): { start: number; end: number } | null {
  const startAttr = el.getAttribute(PLAIN_START)
  const endAttr = el.getAttribute(PLAIN_END)
  if (startAttr == null || endAttr == null) return null
  const start = Number(startAttr)
  const end = Number(endAttr)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null
  return { start, end }
}

function isPlainOffsetIgnore(el: Element): boolean {
  return el.getAttribute(PLAIN_OFFSET_IGNORE) === 'true'
}

/**
 * Maps a DOM Range endpoint to markdown plain-text coordinates (aligned with buildPlainTextMap).
 * Returns null when the endpoint is outside the container or inside non-counted UI (fail closed).
 */
export function tryGetPlainTextOffset(
  container: Element,
  targetNode: Node,
  targetOffset: number,
): number | null {
  if (!container.contains(targetNode)) return null

  const ctx = { offset: 0, found: false, failed: false }

  function fail(): void {
    ctx.failed = true
    ctx.found = true
  }

  function walk(node: Node): void {
    if (ctx.found) return

    if (node === targetNode) {
      if (node.nodeType === TEXT_NODE) {
        if (!isStructuralWhitespaceText(node, container)) {
          const len = (node.textContent ?? '').length
          ctx.offset += Math.min(Math.max(0, targetOffset), len)
        }
        ctx.found = true
        return
      }
      if (node.nodeType === ELEMENT_NODE) {
        const el = node as Element
        if (isPlainOffsetIgnore(el)) {
          fail()
          return
        }
        const plainRange = parsePlainRange(el)
        if (plainRange) {
          if (targetOffset > 0) ctx.offset += plainRange.end - plainRange.start
          ctx.found = true
          return
        }
        const children = el.childNodes
        const limit = Math.min(Math.max(0, targetOffset), children.length)
        for (let i = 0; i < limit; i++) walk(children[i]!)
        ctx.found = true
        return
      }
      fail()
      return
    }

    if (node.nodeType === TEXT_NODE) {
      if (!isStructuralWhitespaceText(node, container)) {
        ctx.offset += (node.textContent ?? '').length
      }
      return
    }

    if (node.nodeType === ELEMENT_NODE) {
      const el = node as Element

      if (isPlainOffsetIgnore(el)) {
        if (el === targetNode || el.contains(targetNode)) fail()
        return
      }

      const plainRange = parsePlainRange(el)
      if (plainRange) {
        if (el !== targetNode && el.contains(targetNode)) {
          fail()
          return
        }
        ctx.offset += plainRange.end - plainRange.start
        return
      }

      for (const child of Array.from(el.childNodes)) {
        walk(child)
        if (ctx.found) return
      }
    }
  }

  walk(container)
  if (ctx.failed || !ctx.found) return null
  return ctx.offset
}

/** @see tryGetPlainTextOffset — returns -1 when offset cannot be resolved (fail closed). */
export function getPlainTextOffset(
  container: Element,
  targetNode: Node,
  targetOffset: number,
): number {
  return tryGetPlainTextOffset(container, targetNode, targetOffset) ?? -1
}

export function trimPlainTextRange(
  range: Range,
  start: number,
  end: number,
): { start: number; end: number } | null {
  let s = start
  let e = end
  if (e < s) [s, e] = [e, s]
  if (e <= s) return null

  const raw = range.toString()
  const trimmed = raw.trim()
  if (!trimmed) return null

  const lead = raw.length - raw.trimStart().length
  const trail = raw.length - raw.trimEnd().length
  s += lead
  e -= trail
  if (e <= s) return null
  return { start: s, end: e }
}

export function computePassageRangeFromSelection(
  container: Element,
  range: Range,
): { start: number; end: number } | null {
  const startRaw = tryGetPlainTextOffset(container, range.startContainer, range.startOffset)
  const endRaw = tryGetPlainTextOffset(container, range.endContainer, range.endOffset)
  if (startRaw == null || endRaw == null) return null
  return trimPlainTextRange(range, startRaw, endRaw)
}

export function tombstonePlainBounds(passages: { start: number; end: number }[]): {
  plainStart: number
  plainEnd: number
} {
  return {
    plainStart: Math.min(...passages.map((p) => p.start)),
    plainEnd: Math.max(...passages.map((p) => p.end)),
  }
}
