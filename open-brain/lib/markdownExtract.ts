export function extractWikilinkSlugs(body: string): string[] {
  return [...body.matchAll(/\[\[([^\]\[|]+)(?:\|[^\]\[]*)?\]\]/g)].map((m) =>
    m[1].trim(),
  )
}

export function extractTasks(body: string): { title: string; done: boolean }[] {
  return [...body.matchAll(/^- \[([ x])\] (.+)$/gm)].map((m) => ({
    title: m[2].trim(),
    done: m[1] === 'x',
  }))
}

export function extractClozeItems(
  body: string,
): { front: string; clozeIndex: number; answer: string }[] {
  return [...body.matchAll(/\{\{c(\d+)::([^}]+)\}\}/g)].map((m) => ({
    front: body,
    clozeIndex: parseInt(m[1], 10),
    answer: m[2],
  }))
}
