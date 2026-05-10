type Props = {
  /** Used to pick a stable color variant per resort. */
  seed?: string;
  className?: string;
};

type Palette = {
  skyTop: string;
  skyMid: string;
  skyBottom: string;
  far: string;
  mid: string;
  near: string;
  snow: string;
  glow: string;
  moon: string;
};

const PALETTES: Palette[] = [
  // Twilight blue
  {
    skyTop: "#0b1027", skyMid: "#1e293b", skyBottom: "#0f172a",
    far: "#334155", mid: "#1e293b", near: "#0b1220",
    snow: "#e0f2fe", glow: "#fde68a", moon: "#fef3c7",
  },
  // Plum / aurora
  {
    skyTop: "#2a0a4a", skyMid: "#1e1b4b", skyBottom: "#0f0d2a",
    far: "#4338ca", mid: "#312e81", near: "#1e1b4b",
    snow: "#ede9fe", glow: "#a78bfa", moon: "#fce7f3",
  },
  // Forest dusk
  {
    skyTop: "#0f2a2e", skyMid: "#0a1f23", skyBottom: "#04161a",
    far: "#0f766e", mid: "#134e4a", near: "#042f2e",
    snow: "#ccfbf1", glow: "#fbbf24", moon: "#fef9c3",
  },
  // Cold steel
  {
    skyTop: "#0f1729", skyMid: "#0a1220", skyBottom: "#020617",
    far: "#475569", mid: "#1e293b", near: "#0b1220",
    snow: "#f1f5f9", glow: "#cbd5e1", moon: "#e2e8f0",
  },
  // Rosé alpenglow
  {
    skyTop: "#3b0d3a", skyMid: "#1f0f2e", skyBottom: "#0c0a1d",
    far: "#831843", mid: "#4c1d3d", near: "#1f0a25",
    snow: "#fce7f3", glow: "#f472b6", moon: "#fdf2f8",
  },
];

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return h >>> 0;
}

function pickPalette(seed?: string): Palette {
  if (!seed) return PALETTES[0];
  return PALETTES[hash(seed) % PALETTES.length];
}

/** Deterministic ridge polyline. */
function ridge(seed: number, baseY: number, amp: number, steps: number, width: number): string {
  let s = seed;
  const next = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  const points: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const x = (i / steps) * width;
    const t = i / steps;
    // Layer two sines + noise for an organic profile.
    const y =
      baseY -
      Math.sin(t * Math.PI) * amp * 0.6 -
      Math.sin(t * Math.PI * 3 + next()) * amp * 0.25 -
      (next() - 0.5) * amp * 0.35;
    points.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return points.join(" ");
}

export function ResortPlaceholder({ seed, className = "" }: Props) {
  const p = pickPalette(seed);
  const h = seed ? hash(seed) : 0;
  const W = 400;
  const H = 300;

  // Three ridge lines — each gets its own deterministic profile.
  const back = ridge(h + 1, 200, 70, 14, W);
  const middle = ridge(h + 2, 235, 80, 16, W);
  const front = ridge(h + 3, 270, 60, 18, W);

  // Snow cap on the front ridge (only above a height threshold).
  const snowThresholdY = 220;
  const frontPoints = front.split(" ").map((pt) => pt.split(",").map(Number) as [number, number]);
  const snowSegments: Array<[number, number][]> = [];
  let cur: [number, number][] = [];
  for (const pt of frontPoints) {
    if (pt[1] < snowThresholdY) {
      cur.push(pt);
    } else if (cur.length) {
      snowSegments.push(cur);
      cur = [];
    }
  }
  if (cur.length) snowSegments.push(cur);

  // Pure deterministic noise function — no shared mutable state.
  const noise = (a: number, b: number) => {
    const x = Math.sin(h * 12.9898 + a * 78.233 + b * 37.719) * 43758.5453;
    return x - Math.floor(x);
  };

  // Stars: deterministic placement.
  const stars: Array<[number, number, number]> = [];
  for (let i = 0; i < 60; i++) {
    stars.push([noise(i, 1) * W, noise(i, 2) * 160, noise(i, 3) * 1.1 + 0.3]);
  }

  const id = `pl-${(h % 1e9).toString(36)}`;
  const moonX = 290 + (noise(99, 1) * 60 - 30);
  const moonY = 60 + (noise(99, 2) * 30 - 15);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid slice"
      className={`absolute inset-0 h-full w-full ${className}`}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={p.skyTop} />
          <stop offset="55%" stopColor={p.skyMid} />
          <stop offset="100%" stopColor={p.skyBottom} />
        </linearGradient>
        <radialGradient id={`${id}-glow`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor={p.glow} stopOpacity="0.45" />
          <stop offset="60%" stopColor={p.glow} stopOpacity="0.08" />
          <stop offset="100%" stopColor={p.glow} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-far`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={p.far} stopOpacity="0.55" />
          <stop offset="100%" stopColor={p.far} stopOpacity="0.25" />
        </linearGradient>
        <linearGradient id={`${id}-mid`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={p.mid} stopOpacity="0.95" />
          <stop offset="100%" stopColor={p.mid} stopOpacity="0.7" />
        </linearGradient>
        <linearGradient id={`${id}-near`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={p.near} stopOpacity="1" />
          <stop offset="100%" stopColor={p.near} stopOpacity="0.95" />
        </linearGradient>
        {/* Subtle film grain via fractal noise */}
        <filter id={`${id}-grain`} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
          <feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.06 0" />
        </filter>
      </defs>

      {/* Sky */}
      <rect width={W} height={H} fill={`url(#${id}-sky)`} />

      {/* Atmospheric glow behind moon */}
      <g transform={`translate(${moonX - 80} ${moonY - 80})`}>
        <rect width="160" height="160" fill={`url(#${id}-glow)`} />
      </g>

      {/* Stars */}
      {stars.map(([x, y, r], i) => (
        <circle key={i} cx={x} cy={y} r={r} fill="#ffffff" opacity={r > 0.9 ? 0.9 : 0.55} />
      ))}

      {/* Moon (with soft inner shadow for crescent feel) */}
      <g>
        <circle cx={moonX} cy={moonY} r={16} fill={p.moon} opacity="0.92" />
        <circle cx={moonX + 5} cy={moonY - 3} r={14} fill={p.skyTop} opacity="0.18" />
      </g>

      {/* Far ridge — hazy */}
      <polygon points={`0,${H} ${back} ${W},${H}`} fill={`url(#${id}-far)`} />

      {/* Middle ridge */}
      <polygon points={`0,${H} ${middle} ${W},${H}`} fill={`url(#${id}-mid)`} />

      {/* Front ridge */}
      <polygon points={`0,${H} ${front} ${W},${H}`} fill={`url(#${id}-near)`} />

      {/* Snow caps along front ridge peaks */}
      {snowSegments.map((seg, i) => {
        const path = seg.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
        const lastY = seg[seg.length - 1]?.[1] ?? snowThresholdY;
        const firstY = seg[0]?.[1] ?? snowThresholdY;
        return (
          <polygon
            key={i}
            points={`${seg[0][0]},${firstY + 18} ${path} ${seg[seg.length - 1][0]},${lastY + 18}`}
            fill={p.snow}
            opacity="0.9"
          />
        );
      })}

      {/* Soft horizon haze */}
      <rect x="0" y={H * 0.55} width={W} height={H * 0.45} fill={p.skyBottom} opacity="0.25" />

      {/* Grain overlay */}
      <rect width={W} height={H} filter={`url(#${id}-grain)`} opacity="0.5" />
    </svg>
  );
}
