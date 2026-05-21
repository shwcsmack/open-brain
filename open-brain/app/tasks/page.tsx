'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import Link from 'next/link'
import { format } from 'date-fns'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE'
type Priority = 'LOW' | 'MEDIUM' | 'HIGH'

const STATUS_ORDER: TaskStatus[] = ['TODO', 'IN_PROGRESS', 'DONE']
const STATUS_LABELS: Record<TaskStatus, string> = {
  TODO: 'To Do',
  IN_PROGRESS: 'In Progress',
  DONE: 'Done',
}
const PRIORITY_BADGE: Record<Priority, 'destructive' | 'secondary' | 'outline'> = {
  HIGH: 'destructive',
  MEDIUM: 'secondary',
  LOW: 'outline',
}

export default function TasksPage() {
  const [newTitle, setNewTitle] = useState('')
  const [statusFilter, setStatusFilter] = useState<TaskStatus | undefined>()
  const [priorityFilter, setPriorityFilter] = useState<Priority | undefined>()
  const utils = trpc.useUtils()

  const { data: tasks, isLoading } = trpc.task.list.useQuery(
    statusFilter || priorityFilter
      ? { status: statusFilter, priority: priorityFilter }
      : undefined,
    { refetchInterval: 30000 }
  )
  const create = trpc.task.create.useMutation({
    onSuccess: () => {
      utils.task.list.invalidate()
      setNewTitle('')
    },
    onError: () => toast.error('Failed to create task'),
  })
  const update = trpc.task.update.useMutation({
    onMutate: async (vars) => {
      const queryInput = (statusFilter || priorityFilter)
        ? { status: statusFilter || undefined, priority: priorityFilter || undefined }
        : undefined
      await utils.task.list.cancel(queryInput)
      const prev = utils.task.list.getData(queryInput)
      utils.task.list.setData(queryInput, old => {
        if (!old) return old
        const updated = old.map(t =>
          t.id === vars.id
            ? { ...t, ...(vars.status !== undefined ? { status: vars.status } : {}), ...(vars.priority !== undefined ? { priority: vars.priority } : {}) }
            : t
        )
        if (queryInput?.status && vars.status && vars.status !== queryInput.status) {
          return updated.filter(t => t.id !== vars.id)
        }
        return updated
      })
      return { prev, queryInput }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev !== undefined) utils.task.list.setData(ctx.queryInput, ctx.prev)
      toast.error('Failed to update task')
    },
    onSettled: () => utils.task.list.invalidate(),
  })
  const del = trpc.task.delete.useMutation({
    onSuccess: () => utils.task.list.invalidate(),
  })

  const grouped = STATUS_ORDER.reduce(
    (acc, s) => {
      acc[s] = tasks?.filter(t => t.status === s) ?? []
      return acc
    },
    {} as Record<TaskStatus, NonNullable<typeof tasks>>
  )

  return (
    <div className="flex min-h-screen">
      <aside className="hidden lg:flex w-56 shrink-0 border-r p-4 flex-col gap-4">
        <nav className="flex flex-col gap-1">
          <Link href="/" className="text-sm font-medium px-2 py-1.5 rounded hover:bg-accent">Notes</Link>
          <Link href="/tasks" className="text-sm font-medium px-2 py-1.5 rounded hover:bg-accent bg-accent">Tasks</Link>
          <Link href="/graph" className="text-sm font-medium px-2 py-1.5 rounded hover:bg-accent">Graph</Link>
          <Link href="/decks" className="text-sm font-medium px-2 py-1.5 rounded hover:bg-accent">Decks</Link>
          <Link href="/review" className="text-sm font-medium px-2 py-1.5 rounded hover:bg-accent">Review</Link>
          <Link href="/settings" className="text-sm font-medium px-2 py-1.5 rounded hover:bg-accent">Settings</Link>
        </nav>
      </aside>

      <main className="flex-1 p-6 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Tasks</h1>
        <div className="flex gap-2">
          <select
            className="text-sm border rounded px-2 py-1"
            value={statusFilter ?? ''}
            onChange={e => setStatusFilter((e.target.value as TaskStatus) || undefined)}
          >
            <option value="">All statuses</option>
            {STATUS_ORDER.map(s => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          <select
            className="text-sm border rounded px-2 py-1"
            value={priorityFilter ?? ''}
            onChange={e => setPriorityFilter((e.target.value as Priority) || undefined)}
          >
            <option value="">All priorities</option>
            {(['HIGH', 'MEDIUM', 'LOW'] as Priority[]).map(p => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex gap-2 mb-6">
        <Input
          placeholder="New task title..."
          value={newTitle}
          onChange={e => setNewTitle(e.target.value)}
          onKeyDown={e =>
            e.key === 'Enter' && newTitle.trim() && create.mutate({ title: newTitle.trim() })
          }
          className="flex-1"
        />
        <Button
          onClick={() => newTitle.trim() && create.mutate({ title: newTitle.trim() })}
          disabled={create.isPending}
        >
          Add
        </Button>
      </div>

      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      )}

      {!isLoading && STATUS_ORDER.map(status => (
        <div key={status} className="mb-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            {STATUS_LABELS[status]} ({grouped[status].length})
          </h2>
          <div className="space-y-1">
            {grouped[status].map(task => (
              <div
                key={task.id}
                className="flex items-center gap-3 p-3 rounded-lg border hover:bg-accent/30"
              >
                <input
                  type="checkbox"
                  checked={task.status === 'DONE'}
                  onChange={e =>
                    update.mutate({ id: task.id, status: e.target.checked ? 'DONE' : 'TODO' })
                  }
                  className="h-4 w-4 shrink-0"
                />
                <span
                  className={`flex-1 text-sm ${task.status === 'DONE' ? 'line-through text-muted-foreground' : ''}`}
                >
                  {task.title}
                </span>
                <select
                  className="text-xs border rounded px-1 py-0.5"
                  value={task.priority}
                  onChange={e =>
                    update.mutate({ id: task.id, priority: e.target.value as Priority })
                  }
                >
                  <option value="HIGH">HIGH</option>
                  <option value="MEDIUM">MED</option>
                  <option value="LOW">LOW</option>
                </select>
                <Badge variant={PRIORITY_BADGE[task.priority as Priority]}>{task.priority}</Badge>
                {task.dueDate && (
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(task.dueDate), 'MMM d')}
                  </span>
                )}
                {task.note && (
                  <Link
                    href={`/notes/${task.note.slug}`}
                    className="text-xs text-primary hover:underline max-w-24 truncate"
                    onClick={e => e.stopPropagation()}
                  >
                    {task.note.title}
                  </Link>
                )}
                <AlertDialog>
                  <AlertDialogTrigger render={<Button variant="ghost" size="sm" className="h-6 w-6 p-0">×</Button>} />
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete task?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will soft-delete the task.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => del.mutate({ id: task.id })}>
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            ))}
            {grouped[status].length === 0 && (
              <p className="text-xs text-muted-foreground py-1">
                No {STATUS_LABELS[status].toLowerCase()} tasks
              </p>
            )}
          </div>
        </div>
      ))}
      </main>
    </div>
  )
}
