export function toSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

export async function uniqueSlug(
  title: string,
  prisma: { note: { findUnique: (args: any) => Promise<any> } },
  excludeId?: string
): Promise<string> {
  const base = toSlug(title) || 'untitled'
  let slug = base
  let i = 2
  while (true) {
    const existing = await prisma.note.findUnique({ where: { slug } })
    if (!existing || existing.id === excludeId) return slug
    slug = `${base}-${i++}`
  }
}
