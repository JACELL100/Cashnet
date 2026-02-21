'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  MarkerType,
  Panel,
  type Node,
  type Edge,
  type NodeTypes,
  Handle,
  Position,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

/* ────────────────────────────────────────────────────────────────────────────
   Node colour by classification
   ──────────────────────────────────────────────────────────────────────────── */
const NODE_STYLES: Record<string, { bg: string; border: string; text: string; glow: string }> = {
  vulnerability: {
    bg: 'rgba(255,56,96,0.12)',
    border: '#ff3860',
    text: '#ff6b88',
    glow: '0 0 12px rgba(255,56,96,0.35)',
  },
  decision: {
    bg: 'rgba(241,196,15,0.10)',
    border: '#f1c40f',
    text: '#f1c40f',
    glow: '0 0 12px rgba(241,196,15,0.25)',
  },
  safe: {
    bg: 'rgba(32,201,151,0.10)',
    border: '#20c997',
    text: '#20c997',
    glow: '0 0 12px rgba(32,201,151,0.25)',
  },
  default: {
    bg: 'rgba(0,212,255,0.08)',
    border: '#00d4ff',
    text: '#e2e8f0',
    glow: '0 0 12px rgba(0,212,255,0.20)',
  },
};

function classify(label: string, shape: string): string {
  const lower = label.toLowerCase();
  if (lower.includes('⚠') || lower.includes('vuln') || lower.includes('attack') || lower.includes('risk') || lower.includes('exploit') || lower.includes('danger'))
    return 'vulnerability';
  if (shape === 'diamond' || lower.includes('check') || lower.includes('if ') || lower.includes('valid'))
    return 'decision';
  if (lower.includes('safe') || lower.includes('✓') || lower.includes('guard') || lower.includes('fixed') || lower.includes('success'))
    return 'safe';
  return 'default';
}

/* ────────────────────────────────────────────────────────────────────────────
   Custom node components
   ──────────────────────────────────────────────────────────────────────────── */

function UmlBoxNode({ data }: { data: { label: string; kind: string } }) {
  const style = NODE_STYLES[data.kind] || NODE_STYLES.default;
  const icon =
    data.kind === 'vulnerability' ? '⚠' :
    data.kind === 'decision' ? '◇' :
    data.kind === 'safe' ? '✓' : '⬡';

  return (
    <div
      className="relative"
      style={{
        background: style.bg,
        border: `1.5px solid ${style.border}`,
        borderRadius: 8,
        boxShadow: style.glow,
        padding: '10px 16px',
        minWidth: 160,
        maxWidth: 260,
        fontFamily: 'IBM Plex Mono, monospace',
        cursor: 'grab',
        userSelect: 'none',
      }}
    >
      {/* Handles */}
      <Handle type="target" position={Position.Top} style={{ background: style.border, width: 8, height: 8, border: 'none' }} />
      <Handle type="source" position={Position.Bottom} style={{ background: style.border, width: 8, height: 8, border: 'none' }} />
      <Handle type="target" position={Position.Left} id="left-target" style={{ background: style.border, width: 8, height: 8, border: 'none' }} />
      <Handle type="source" position={Position.Right} id="right-source" style={{ background: style.border, width: 8, height: 8, border: 'none' }} />

      {/* Header bar */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 3,
          borderRadius: '8px 8px 0 0',
          background: style.border,
        }}
      />
      {/* Content */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <span style={{ color: style.border, fontSize: 14, flexShrink: 0, marginTop: 1 }}>{icon}</span>
        <span style={{ color: style.text, fontSize: 11, lineHeight: '1.5', wordBreak: 'break-word' }}>
          {data.label}
        </span>
      </div>
    </div>
  );
}

function UmlDiamondNode({ data }: { data: { label: string; kind: string } }) {
  const style = NODE_STYLES.decision;
  return (
    <div className="relative" style={{ width: 180, height: 100, cursor: 'grab', userSelect: 'none' }}>
      <Handle type="target" position={Position.Top} style={{ background: style.border, width: 8, height: 8, border: 'none' }} />
      <Handle type="source" position={Position.Bottom} style={{ background: style.border, width: 8, height: 8, border: 'none' }} />
      <Handle type="target" position={Position.Left} id="left-target" style={{ background: style.border, width: 8, height: 8, border: 'none' }} />
      <Handle type="source" position={Position.Right} id="right-source" style={{ background: style.border, width: 8, height: 8, border: 'none' }} />
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          width: '130%',
          height: '130%',
          transform: 'translate(-50%, -50%) rotate(45deg)',
          background: style.bg,
          border: `1.5px solid ${style.border}`,
          borderRadius: 6,
          boxShadow: style.glow,
        }}
      />
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          padding: '8px 12px',
          fontFamily: 'IBM Plex Mono, monospace',
          color: style.text,
          fontSize: 11,
          textAlign: 'center',
          wordBreak: 'break-word',
          lineHeight: '1.4',
        }}
      >
        {data.label}
      </div>
    </div>
  );
}

const nodeTypes: NodeTypes = {
  umlBox: UmlBoxNode,
  umlDiamond: UmlDiamondNode,
};

/* ────────────────────────────────────────────────────────────────────────────
   Mermaid → React Flow parser
   ──────────────────────────────────────────────────────────────────────────── */

interface ParsedNode {
  id: string;
  label: string;
  shape: 'box' | 'diamond' | 'round' | 'stadium';
}

interface ParsedEdge {
  from: string;
  to: string;
  label?: string;
  style?: string;
}

function parseMermaid(mermaid: string): { nodes: ParsedNode[]; edges: ParsedEdge[] } {
  const nodes = new Map<string, ParsedNode>();
  const edges: ParsedEdge[] = [];

  // Normalise: replace literal \n with real newlines
  const text = mermaid.replace(/\\n/g, '\n');
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  // Helper to register a node from id + optional label/shape
  const ensureNode = (raw: string): string => {
    // id[label], id{label}, id(label), id([label]), id((label)), id>label], id{label}
    const m =
      raw.match(/^(\w+)\[([^\]]*)\]/) ||        // [box]
      raw.match(/^(\w+)\{([^}]*)\}/) ||          // {diamond}
      raw.match(/^(\w+)\(\(([^)]*)\)\)/) ||      // ((circle))
      raw.match(/^(\w+)\(([^)]*)\)/) ||           // (round)
      raw.match(/^(\w+)\[\[([^\]]*)\]\]/) ||     // [[subroutine]]
      raw.match(/^(\w+)>([^\]]*)\]/);             // >asymmetric]

    if (m) {
      const id = m[1];
      const label = m[2].trim();
      let shape: ParsedNode['shape'] = 'box';
      if (raw.match(/^\w+\{/)) shape = 'diamond';
      else if (raw.match(/^\w+\(\(/)) shape = 'round';
      else if (raw.match(/^\w+\(/)) shape = 'stadium';
      if (!nodes.has(id)) {
        nodes.set(id, { id, label, shape });
      }
      return id;
    }
    // Plain id
    const plainId = raw.replace(/[^a-zA-Z0-9_]/g, '') || raw;
    if (!nodes.has(plainId)) {
      nodes.set(plainId, { id: plainId, label: plainId, shape: 'box' });
    }
    return plainId;
  };

  for (const line of lines) {
    // Skip directives
    if (/^(flowchart|graph|subgraph|end|style|classDef|class |linkStyle|%%|direction)/i.test(line)) continue;

    // Edge patterns:  A -->|label| B  or  A --> B  or A -.->|label| B  etc.
    const edgeRe = /^(.+?)\s*(-->|==>|-.->|---->|~~~|--\s|---)\s*(?:\|([^|]*)\|\s*)?(.+)$/;
    const em = line.match(edgeRe);
    if (em) {
      const fromRaw = em[1].trim();
      const arrow = em[2].trim();
      const label = em[3]?.trim();
      const toRaw = em[4].trim();
      const fromId = ensureNode(fromRaw);
      const toId = ensureNode(toRaw);
      let style: string | undefined;
      if (arrow.includes('-.') || arrow.includes('~~~')) style = 'dashed';
      if (arrow.includes('==>')) style = 'thick';
      edges.push({ from: fromId, to: toId, label, style });
      continue;
    }

    // Standalone node definition
    if (/^\w+[\[({]/.test(line)) {
      ensureNode(line);
    }
  }

  return { nodes: Array.from(nodes.values()), edges };
}

/* ────────────────────────────────────────────────────────────────────────────
   Auto-layout: simple top-down with layers
   ──────────────────────────────────────────────────────────────────────────── */
function autoLayout(parsed: { nodes: ParsedNode[]; edges: ParsedEdge[] }): { nodes: Node[]; edges: Edge[] } {
  const { nodes: pNodes, edges: pEdges } = parsed;

  // Build adjacency for topological sort
  const inDegree = new Map<string, number>();
  const children = new Map<string, string[]>();
  for (const n of pNodes) {
    inDegree.set(n.id, 0);
    children.set(n.id, []);
  }
  for (const e of pEdges) {
    inDegree.set(e.to, (inDegree.get(e.to) ?? 0) + 1);
    children.get(e.from)?.push(e.to);
  }

  // BFS layers
  const layers: string[][] = [];
  const assigned = new Set<string>();
  let queue = pNodes.filter(n => (inDegree.get(n.id) ?? 0) === 0).map(n => n.id);
  if (queue.length === 0 && pNodes.length > 0) queue = [pNodes[0].id];

  while (queue.length > 0) {
    layers.push([...queue]);
    queue.forEach(id => assigned.add(id));
    const next: string[] = [];
    for (const id of queue) {
      for (const c of children.get(id) ?? []) {
        if (!assigned.has(c) && !next.includes(c)) {
          // Check all parents are assigned
          const allParentsAssigned = pEdges
            .filter(e => e.to === c)
            .every(e => assigned.has(e.from));
          if (allParentsAssigned) next.push(c);
        }
      }
    }
    // Handle orphan nodes
    if (next.length === 0) {
      const orphan = pNodes.find(n => !assigned.has(n.id));
      if (orphan) next.push(orphan.id);
    }
    queue = next;
    if (layers.length > 100) break; // safety
  }
  // Any remaining
  const remaining = pNodes.filter(n => !assigned.has(n.id));
  if (remaining.length) layers.push(remaining.map(n => n.id));

  // Position
  const NODE_W = 200;
  const NODE_H = 80;
  const GAP_X = 60;
  const GAP_Y = 100;
  const nodeMap = new Map(pNodes.map(n => [n.id, n]));

  const flowNodes: Node[] = [];
  for (let layer = 0; layer < layers.length; layer++) {
    const ids = layers[layer];
    const totalW = ids.length * NODE_W + (ids.length - 1) * GAP_X;
    const startX = -totalW / 2;
    ids.forEach((id, col) => {
      const pn = nodeMap.get(id);
      if (!pn) return;
      const kind = classify(pn.label, pn.shape);
      flowNodes.push({
        id,
        type: pn.shape === 'diamond' ? 'umlDiamond' : 'umlBox',
        position: { x: startX + col * (NODE_W + GAP_X), y: layer * (NODE_H + GAP_Y) },
        data: { label: pn.label, kind },
        draggable: true,
        selectable: true,
        connectable: false,
      });
    });
  }

  const flowEdges: Edge[] = pEdges.map((e, i) => {
    const isVuln = (e.label?.toLowerCase().includes('attack') || e.label?.toLowerCase().includes('vuln') || e.label?.toLowerCase().includes('exploit'));
    return {
      id: `e-${i}`,
      source: e.from,
      target: e.to,
      label: e.label || undefined,
      type: 'smoothstep',
      animated: isVuln || e.style === 'dashed',
      style: {
        stroke: isVuln ? '#ff3860' : e.style === 'thick' ? '#f1c40f' : '#4a5568',
        strokeWidth: isVuln || e.style === 'thick' ? 2.5 : 1.5,
        strokeDasharray: e.style === 'dashed' ? '6 3' : undefined,
      },
      labelStyle: { fill: '#94a3b8', fontSize: 10, fontFamily: 'IBM Plex Mono, monospace' },
      labelBgStyle: { fill: '#0f0f1a', fillOpacity: 0.85 },
      labelBgPadding: [6, 4] as [number, number],
      labelBgBorderRadius: 4,
      markerEnd: { type: MarkerType.ArrowClosed, color: isVuln ? '#ff3860' : '#4a5568', width: 16, height: 16 },
    };
  });

  return { nodes: flowNodes, edges: flowEdges };
}

/* ────────────────────────────────────────────────────────────────────────────
   Main component
   ──────────────────────────────────────────────────────────────────────────── */

interface ContractFlowDiagramProps {
  mermaidChart: string;
  className?: string;
}

export default function ContractFlowDiagram({ mermaidChart, className = '' }: ContractFlowDiagramProps) {
  const parsed = useMemo(() => parseMermaid(mermaidChart), [mermaidChart]);
  const layout = useMemo(() => autoLayout(parsed), [parsed]);

  const [nodes, setNodes, onNodesChange] = useNodesState(layout.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(layout.edges);

  // Sync when mermaid chart changes
  useEffect(() => {
    setNodes(layout.nodes);
    setEdges(layout.edges);
  }, [layout, setNodes, setEdges]);

  const [legend, setLegend] = useState(true);

  return (
    <div className={`relative ${className}`} style={{ height: 560, width: '100%', borderRadius: 8, overflow: 'hidden', background: '#0a0a14' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.3, maxZoom: 1.4 }}
        minZoom={0.2}
        maxZoom={3}
        proOptions={{ hideAttribution: true }}
        nodesDraggable={true}
        nodesConnectable={false}
        elementsSelectable={true}
        panOnScroll
        zoomOnScroll
        selectNodesOnDrag={false}
        defaultEdgeOptions={{
          type: 'smoothstep',
        }}
      >
        <Background color="#1a1a2e" gap={20} size={1} />
        <Controls
          style={{
            background: 'rgba(15,15,26,0.9)',
            border: '1px solid rgba(0,212,255,0.2)',
            borderRadius: 8,
          }}
        />
        <MiniMap
          nodeColor={(n) => {
            const kind = (n.data as { kind?: string })?.kind || 'default';
            return NODE_STYLES[kind]?.border || '#00d4ff';
          }}
          maskColor="rgba(10,10,20,0.8)"
          style={{
            background: 'rgba(15,15,26,0.95)',
            border: '1px solid rgba(0,212,255,0.15)',
            borderRadius: 8,
          }}
        />

        {/* Legend panel */}
        <Panel position="top-right">
          <div
            style={{
              background: 'rgba(15,15,26,0.92)',
              border: '1px solid rgba(0,212,255,0.2)',
              borderRadius: 8,
              padding: legend ? '10px 14px' : '6px 10px',
              fontFamily: 'IBM Plex Mono, monospace',
              fontSize: 10,
              color: '#94a3b8',
              backdropFilter: 'blur(8px)',
              maxWidth: 200,
              cursor: 'pointer',
            }}
            onClick={() => setLegend(!legend)}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ fontWeight: 700, color: '#e2e8f0', letterSpacing: 1 }}>LEGEND</span>
              <span style={{ fontSize: 8 }}>{legend ? '▲' : '▼'}</span>
            </div>
            {legend && (
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[
                  { color: '#00d4ff', label: 'Normal Flow' },
                  { color: '#ff3860', label: '⚠ Vulnerability' },
                  { color: '#f1c40f', label: '◇ Decision / Check' },
                  { color: '#20c997', label: '✓ Safe / Guard' },
                ].map((item) => (
                  <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 10, height: 10, borderRadius: 3, background: item.color, flexShrink: 0 }} />
                    <span>{item.label}</span>
                  </div>
                ))}
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 6, marginTop: 2, color: '#64748b' }}>
                  Drag nodes to rearrange · Scroll to zoom · Ctrl+scroll to pan
                </div>
              </div>
            )}
          </div>
        </Panel>

        {/* Title panel */}
        <Panel position="top-left">
          <div
            style={{
              background: 'rgba(15,15,26,0.92)',
              border: '1px solid rgba(0,212,255,0.2)',
              borderRadius: 8,
              padding: '8px 14px',
              fontFamily: 'IBM Plex Mono, monospace',
              backdropFilter: 'blur(8px)',
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, color: '#00d4ff', letterSpacing: 1 }}>CONTRACT FLOW</div>
            <div style={{ fontSize: 9, color: '#64748b', marginTop: 2 }}>
              {parsed.nodes.length} nodes · {parsed.edges.length} edges
            </div>
          </div>
        </Panel>
      </ReactFlow>
    </div>
  );
}
