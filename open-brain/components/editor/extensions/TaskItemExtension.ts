import { TaskList } from '@tiptap/extension-task-list'
import { TaskItem } from '@tiptap/extension-task-item'

export { TaskList, TaskItem }

export function extractTaskItems(
  doc: { type: string; content?: unknown[] }
): Array<{ title: string; done: boolean }> {
  const tasks: Array<{ title: string; done: boolean }> = []
  const traverse = (node: Record<string, unknown>) => {
    if (node.type === 'taskItem') {
      const content = node.content as Array<Record<string, unknown>> | undefined
      const textContent =
        content
          ?.flatMap(c => (c.content as Array<Record<string, unknown>> | undefined) ?? [])
          .filter(c => c.type === 'text')
          .map(c => c.text as string)
          .join('') ?? ''
      if (textContent.trim()) {
        tasks.push({
          title: textContent.trim(),
          done: (node.attrs as Record<string, unknown>)?.checked === true,
        })
      }
    }
    const content = node.content as Array<Record<string, unknown>> | undefined
    if (content) content.forEach(traverse)
  }
  traverse(doc as Record<string, unknown>)
  return tasks
}
