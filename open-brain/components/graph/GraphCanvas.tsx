'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import * as d3 from 'd3-force'
import ReactFlow, { Background, Controls, useNodesState, useEdgesState, type Node, type Edge } from 'reactflow'
import 'reactflow/dist/style.css'

interface GraphNode { id: string; title: string; slug: string }
interface GraphEdge { sourceNoteId: string; targetNoteId: string }
interface GraphData { nodes: GraphNode[]; edges: GraphEdge[] }

type SimNode = d3.SimulationNodeDatum & { id: string }

export function GraphCanvas({ data }: { data: GraphData }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const focusId = searchParams.get('focus')
  const [hopDepth, setHopDepth] = useState(2)
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  // Compute visible nodes based on focus + hop depth
  const visibleIds = useMemo(() => {
    if (!focusId) return null
    const neighbours = new Set<string>([focusId])
    for (let h = 0; h < hopDepth; h++) {
      data.edges.forEach(e => {
        if (neighbours.has(e.sourceNoteId)) neighbours.add(e.targetNoteId)
        if (neighbours.has(e.targetNoteId)) neighbours.add(e.sourceNoteId)
      })
    }
    return neighbours
  }, [focusId, hopDepth, data.edges])

  // Run d3-force simulation synchronously
  const { rfNodes, rfEdges } = useMemo(() => {
    const simNodes: SimNode[] = data.nodes.map(n => ({ id: n.id, x: 0, y: 0 }))
    const simLinks = data.edges.map(e => ({ source: e.sourceNoteId, target: e.targetNoteId }))

    const sim = d3.forceSimulation<SimNode>(simNodes)
      .force('link', d3.forceLink<SimNode, d3.SimulationLinkDatum<SimNode>>(simLinks).id((d) => d.id).distance(120))
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(0, 0))

    for (let i = 0; i < 300; i++) sim.tick()
    sim.stop()

    const posMap = new Map(simNodes.map(n => [n.id, { x: n.x ?? 0, y: n.y ?? 0 }]))

    const filteredNodes = data.nodes.filter(n => !visibleIds || visibleIds.has(n.id))
    const filteredEdges = data.edges.filter(e =>
      !visibleIds || (visibleIds.has(e.sourceNoteId) && visibleIds.has(e.targetNoteId))
    )

    const rfNodes: Node[] = filteredNodes.map(n => ({
      id: n.id,
      position: posMap.get(n.id) ?? { x: 0, y: 0 },
      data: { label: n.title.slice(0, 30), slug: n.slug },
      style: hoveredId && hoveredId !== n.id &&
        !data.edges.some(e =>
          (e.sourceNoteId === hoveredId && e.targetNoteId === n.id) ||
          (e.targetNoteId === hoveredId && e.sourceNoteId === n.id)
        )
        ? { opacity: 0.2 }
        : undefined,
    }))

    const rfEdges: Edge[] = filteredEdges.map(e => ({
      id: `${e.sourceNoteId}-${e.targetNoteId}`,
      source: e.sourceNoteId,
      target: e.targetNoteId,
      style: hoveredId &&
        e.sourceNoteId !== hoveredId &&
        e.targetNoteId !== hoveredId
        ? { opacity: 0.1 }
        : undefined,
    }))

    return { rfNodes, rfEdges }
  }, [data, visibleIds, hoveredId])

  const [nodes, setNodes, onNodesChange] = useNodesState(rfNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(rfEdges)

  useEffect(() => {
    setNodes(rfNodes)
    setEdges(rfEdges)
  }, [rfNodes, rfEdges, setNodes, setEdges])

  return (
    <div className="w-full h-full relative">
      {focusId && (
        <div className="absolute top-4 left-4 z-10 bg-background border rounded-lg p-3 flex items-center gap-3">
          <label className="text-sm font-medium">Depth</label>
          <input
            type="range"
            min={1}
            max={5}
            value={hopDepth}
            onChange={e => setHopDepth(Number(e.target.value))}
            className="w-24"
          />
          <span className="text-sm w-4 text-center">{hopDepth}</span>
        </div>
      )}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={(_, node) => router.push(`/notes/${(node.data as { slug: string }).slug}`)}
        onNodeMouseEnter={(_, node) => setHoveredId(node.id)}
        onNodeMouseLeave={() => setHoveredId(null)}
        fitView
      >
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  )
}
