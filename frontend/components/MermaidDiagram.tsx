'use client';

import React, { useEffect, useRef, useState } from 'react';

interface MermaidDiagramProps {
  chart: string;
  className?: string;
}

const MermaidDiagram: React.FC<MermaidDiagramProps> = ({ chart, className = '' }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [rendered, setRendered] = useState(false);
  const idRef = useRef(`mermaid-${Math.random().toString(36).slice(2)}`);

  useEffect(() => {
    let cancelled = false;

    const render = async () => {
      if (!containerRef.current || !chart) return;
      setError(null);
      setRendered(false);

      try {
        const mermaid = (await import('mermaid')).default;

        mermaid.initialize({
          startOnLoad: false,
          theme: 'dark',
          themeVariables: {
            primaryColor: '#00d4ff',
            primaryTextColor: '#e2e8f0',
            primaryBorderColor: '#00d4ff',
            lineColor: '#4a5568',
            secondaryColor: '#1a1a2e',
            tertiaryColor: '#16213e',
            background: '#0f0f1a',
            mainBkg: '#1a1a2e',
            nodeBorder: '#00d4ff',
            clusterBkg: '#16213e',
            titleColor: '#00d4ff',
            edgeLabelBackground: '#1a1a2e',
            attributeBackgroundColorEven: '#16213e',
            attributeBackgroundColorOdd: '#1a1a2e',
          },
          flowchart: { curve: 'basis', htmlLabels: true },
          securityLevel: 'loose',
        });

        const { svg } = await mermaid.render(idRef.current, chart);

        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg;
          // Make SVG responsive
          const svgEl = containerRef.current.querySelector('svg');
          if (svgEl) {
            svgEl.style.maxWidth = '100%';
            svgEl.style.height = 'auto';
          }
          setRendered(true);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : String(err);
          setError(msg);
        }
      }
    };

    render();
    return () => { cancelled = true; };
  }, [chart]);

  if (error) {
    return (
      <div className={`rounded border border-[#ff3860] bg-[rgba(255,56,96,0.08)] p-4 ${className}`}>
        <p className="text-xs font-mono text-[#ff3860] mb-2">⚠ Diagram render error</p>
        <pre className="text-xs text-text-secondary whitespace-pre-wrap overflow-auto max-h-40">{chart}</pre>
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      {!rendered && (
        <div className="flex items-center justify-center h-32">
          <div className="text-xs font-mono text-text-secondary animate-pulse">Rendering diagram…</div>
        </div>
      )}
      <div ref={containerRef} className="w-full overflow-auto" />
    </div>
  );
};

export default MermaidDiagram;
