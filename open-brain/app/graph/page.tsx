'use client'
import { Suspense } from 'react'
import { trpc } from '@/lib/trpc'
import { GraphCanvas } from '@/components/graph/GraphCanvas'

function GraphInner() {
  const { data } = trpc.graph.getAll.useQuery()
  if (!data) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Loading graph...
      </div>
    )
  }
  return <GraphCanvas data={data} />
}

export default function GraphPage() {
  return (
    <div className="w-full h-[calc(100vh-4rem)]">
      <Suspense fallback={<div className="flex items-center justify-center h-full">Loading...</div>}>
        <GraphInner />
      </Suspense>
    </div>
  )
}
