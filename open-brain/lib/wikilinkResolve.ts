/**
 * Pure helper: given an ordered list of wikilink slugs (with possible duplicates)
 * and a `slug -> noteId` lookup map, return the deduped, order-preserving list
 * of resolved note ids. Slugs that are absent from the map are dropped silently
 * — that's how unresolved wikilinks (e.g. `[[draft-topic]]` or
 * `[[daily/2026-01-01]]` periodic placeholders) avoid creating bogus
 * `NoteLink` rows.
 *
 * Lives in its own module (no prisma import) so unit tests can exercise it
 * without booting the database client.
 */
export function resolveTargetNoteIds(
  slugs: string[],
  slugToId: Map<string, string>,
): string[] {
  const ids: string[] = []
  const seen = new Set<string>()
  for (const slug of slugs) {
    const id = slugToId.get(slug)
    if (id && !seen.has(id)) {
      seen.add(id)
      ids.push(id)
    }
  }
  return ids
}
