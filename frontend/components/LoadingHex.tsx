'use client';

/**
 * Animated hexagonal loading indicator — matches the cashnet brand icon.
 * Renders an inline SVG with pulse + glow animation.
 */
export default function LoadingHex({ size = 56 }: { size?: number }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4">
      <div className="animate-[pulse_1.6s_ease-in-out_infinite]" style={{ filter: 'drop-shadow(0 0 12px rgba(0,212,255,0.5))' }}>
        <svg
          width={size}
          height={size}
          viewBox="0 0 100 100"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="animate-[spin_4s_linear_infinite]"
        >
          {/* Outer hexagon */}
          <polygon
            points="50,2 93,27 93,73 50,98 7,73 7,27"
            fill="rgba(0,212,255,0.08)"
            stroke="var(--accent, #00d4ff)"
            strokeWidth="2.5"
          />
          {/* Inner hexagon */}
          <polygon
            points="50,22 75,36 75,64 50,78 25,64 25,36"
            fill="rgba(0,212,255,0.12)"
            stroke="var(--accent, #00d4ff)"
            strokeWidth="1.5"
            opacity="0.7"
          />
          {/* Center star-burst lines */}
          <line x1="50" y1="22" x2="50" y2="78" stroke="var(--accent, #00d4ff)" strokeWidth="1" opacity="0.5" />
          <line x1="25" y1="36" x2="75" y2="64" stroke="var(--accent, #00d4ff)" strokeWidth="1" opacity="0.5" />
          <line x1="75" y1="36" x2="25" y2="64" stroke="var(--accent, #00d4ff)" strokeWidth="1" opacity="0.5" />
          {/* Center dot */}
          <circle cx="50" cy="50" r="4" fill="var(--accent, #00d4ff)" opacity="0.9" />
        </svg>
      </div>
      <span className="text-xs font-mono text-text-tertiary tracking-widest uppercase animate-pulse">
        Loading…
      </span>
    </div>
  );
}
