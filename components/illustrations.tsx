/*
 * Duotone architectural line illustrations (SVG) standing in for photography
 * during the prototype phase. Palette is limited to the brand tokens:
 * ink #171716 · graphite #45453f · stone #8b8b84 · hairline #e3e1da ·
 * mist #f1f0ec · steel #4d6172.
 */

const INK = "#171716";
const GRAPHITE = "#45453f";
const STONE = "#8b8b84";
const HAIRLINE = "#e3e1da";
const MIST = "#f1f0ec";
const STEEL = "#4d6172";

/** Vertical dimension annotation (technical drawing style). */
function DimV({ x, y1, y2, label }: { x: number; y1: number; y2: number; label: string }) {
  return (
    <g stroke={STONE} strokeWidth="1" fill="none">
      <line x1={x} y1={y1} x2={x} y2={y2} />
      <line x1={x - 5} y1={y1} x2={x + 5} y2={y1} />
      <line x1={x - 5} y1={y2} x2={x + 5} y2={y2} />
      <text
        x={x + 10}
        y={(y1 + y2) / 2}
        fill={STONE}
        stroke="none"
        fontSize="11"
        fontFamily="inherit"
        dominantBaseline="middle"
      >
        {label}
      </text>
    </g>
  );
}

/** Hero: frameless glass railing on a cantilevered slab, elevation view. */
export function HeroScene() {
  return (
    <svg viewBox="0 0 1100 620" className="h-auto w-full" role="img" aria-label="Glass railing on a terrace, technical elevation">
      {/* sun + horizon */}
      <circle cx="880" cy="150" r="86" fill="none" stroke={HAIRLINE} strokeWidth="1.5" />
      <line x1="0" y1="470" x2="1100" y2="470" stroke={HAIRLINE} strokeWidth="1" />
      {/* distant ridge */}
      <polyline points="620,470 730,395 800,440 900,375 1010,440 1100,410" fill="none" stroke={HAIRLINE} strokeWidth="1.5" />

      {/* building mass */}
      <rect x="60" y="120" width="180" height="290" fill={MIST} />
      <rect x="60" y="120" width="180" height="290" fill="none" stroke={HAIRLINE} strokeWidth="1" />

      {/* cantilevered slab */}
      <rect x="60" y="410" width="720" height="22" fill={INK} />
      <line x1="240" y1="432" x2="240" y2="470" stroke={GRAPHITE} strokeWidth="2" />
      <line x1="430" y1="432" x2="430" y2="470" stroke={GRAPHITE} strokeWidth="2" />

      {/* glass panels on base profile */}
      <rect x="260" y="404" width="510" height="8" fill={GRAPHITE} />
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <rect x={266 + i * 170} y={300} width={158} height={104} fill={STEEL} opacity="0.09" />
          <rect x={266 + i * 170} y={300} width={158} height={104} fill="none" stroke={STEEL} strokeWidth="1.2" opacity="0.55" />
        </g>
      ))}
      {/* polished top edge */}
      <line x1="266" y1="300" x2="764" y2="300" stroke={INK} strokeWidth="2" />

      {/* figure for scale */}
      <g stroke={GRAPHITE} strokeWidth="1.6" fill="none">
        <circle cx="180" cy="292" r="9" />
        <line x1="180" y1="301" x2="180" y2="352" />
        <line x1="180" y1="316" x2="166" y2="336" />
        <line x1="180" y1="316" x2="194" y2="336" />
        <line x1="180" y1="352" x2="169" y2="388" />
        <line x1="180" y1="352" x2="191" y2="388" />
      </g>

      {/* dimension: 1000 mm guard height */}
      <DimV x={800} y1={300} y2={410} label="1000" />
    </svg>
  );
}

/** Product card: bar railing, front elevation with dimension. */
export function BarRailingElevation() {
  const bars = Array.from({ length: 19 }, (_, i) => 78 + i * 13);
  return (
    <svg viewBox="0 0 420 300" className="h-auto w-full" role="img" aria-label="Bar railing elevation">
      <line x1="20" y1="252" x2="400" y2="252" stroke={HAIRLINE} strokeWidth="2" />
      {/* posts */}
      <line x1="60" y1="70" x2="60" y2="252" stroke={INK} strokeWidth="4" />
      <line x1="340" y1="70" x2="340" y2="252" stroke={INK} strokeWidth="4" />
      {/* handrail + bottom rail */}
      <line x1="48" y1="68" x2="352" y2="68" stroke={INK} strokeWidth="5" />
      <line x1="60" y1="238" x2="340" y2="238" stroke={GRAPHITE} strokeWidth="3" />
      {/* bars */}
      {bars.map((x) => (
        <line key={x} x1={x} y1="72" x2={x} y2="236" stroke={GRAPHITE} strokeWidth="1.4" />
      ))}
      <DimV x={374} y1={68} y2={252} label="1000" />
    </svg>
  );
}

/** Product card: glass railing, front elevation with dimension. */
export function GlassRailingElevation() {
  return (
    <svg viewBox="0 0 420 300" className="h-auto w-full" role="img" aria-label="Glass railing elevation">
      <line x1="20" y1="252" x2="400" y2="252" stroke={HAIRLINE} strokeWidth="2" />
      {/* base profile */}
      <rect x="48" y="230" width="304" height="16" fill={INK} />
      {/* glass panels */}
      {[0, 1].map((i) => (
        <g key={i}>
          <rect x={54 + i * 150} y={72} width={142} height={158} fill={STEEL} opacity="0.09" />
          <rect x={54 + i * 150} y={72} width={142} height={158} fill="none" stroke={STEEL} strokeWidth="1.3" opacity="0.6" />
        </g>
      ))}
      {/* polished edge */}
      <line x1="54" y1="72" x2="346" y2="72" stroke={INK} strokeWidth="2.5" />
      <DimV x={374} y1={72} y2={252} label="1000" />
    </svg>
  );
}

/** Reference project scenes — six abstract duotone compositions. */
export function ReferenceScene({ index }: { index: number }) {
  const scenes = [
    // 0 — terraced house, glass, lake horizon
    <g key="0">
      <circle cx="330" cy="70" r="42" fill="none" stroke={HAIRLINE} strokeWidth="1.5" />
      <rect x="30" y="60" width="130" height="180" fill={MIST} />
      <rect x="70" y="120" width="230" height="14" fill={INK} />
      <rect x="80" y="78" width="210" height="42" fill={STEEL} opacity="0.09" />
      <rect x="80" y="78" width="210" height="42" fill="none" stroke={STEEL} opacity="0.55" />
      <rect x="70" y="196" width="260" height="14" fill={INK} />
      <rect x="80" y="154" width="240" height="42" fill={STEEL} opacity="0.09" />
      <rect x="80" y="154" width="240" height="42" fill="none" stroke={STEEL} opacity="0.55" />
      <line x1="0" y1="252" x2="400" y2="252" stroke={HAIRLINE} />
    </g>,
    // 1 — courtyard, fine bars
    <g key="1">
      <rect x="40" y="40" width="90" height="212" fill={MIST} />
      <rect x="270" y="40" width="90" height="212" fill={MIST} />
      <rect x="130" y="150" width="140" height="10" fill={INK} />
      <line x1="136" y1="96" x2="264" y2="96" stroke={INK} strokeWidth="3" />
      {Array.from({ length: 11 }, (_, i) => (
        <line key={i} x1={140 + i * 12} y1="98" x2={140 + i * 12} y2="150" stroke={GRAPHITE} strokeWidth="1.2" />
      ))}
      <line x1="0" y1="252" x2="400" y2="252" stroke={HAIRLINE} />
    </g>,
    // 2 — staircase, sloped bar railing
    <g key="2">
      {[0, 1, 2, 3, 4].map((i) => (
        <rect key={i} x={60 + i * 56} y={220 - i * 34} width="56" height={34 + i * 34} fill={MIST} />
      ))}
      <line x1="66" y1="180" x2="330" y2="20" stroke={INK} strokeWidth="3.5" />
      {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => {
        const x = 78 + i * 30;
        const yTop = 173 - i * 18.2;
        return <line key={i} x1={x} y1={yTop} x2={x} y2={yTop + 52} stroke={GRAPHITE} strokeWidth="1.2" />;
      })}
      <line x1="0" y1="254" x2="400" y2="254" stroke={HAIRLINE} />
    </g>,
    // 3 — lake house, tinted glass, sun
    <g key="3">
      <circle cx="90" cy="80" r="34" fill="none" stroke={HAIRLINE} strokeWidth="1.5" />
      <polyline points="0,210 90,168 170,205 260,160 400,205" fill="none" stroke={HAIRLINE} strokeWidth="1.5" />
      <rect x="120" y="196" width="220" height="12" fill={INK} />
      <rect x="130" y="140" width="200" height="56" fill={STEEL} opacity="0.14" />
      <rect x="130" y="140" width="200" height="56" fill="none" stroke={STEEL} opacity="0.6" />
      <line x1="124" y1="138" x2="336" y2="138" stroke={INK} strokeWidth="3" />
      <line x1="0" y1="252" x2="400" y2="252" stroke={HAIRLINE} />
    </g>,
    // 4 — hotel facade, stacked balconies
    <g key="4">
      <rect x="70" y="30" width="260" height="222" fill={MIST} />
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <rect x="90" y={80 + i * 60} width="220" height="8" fill={INK} />
          <line x1="94" y1={52 + i * 60} x2="306" y2={52 + i * 60} stroke={INK} strokeWidth="2.5" />
          {Array.from({ length: 17 }, (_, j) => (
            <line key={j} x1={98 + j * 12.6} y1={54 + i * 60} x2={98 + j * 12.6} y2={80 + i * 60} stroke={GRAPHITE} strokeWidth="1" />
          ))}
        </g>
      ))}
      <line x1="0" y1="252" x2="400" y2="252" stroke={HAIRLINE} />
    </g>,
    // 5 — apartment balconies, satin glass dividers
    <g key="5">
      <rect x="30" y="50" width="340" height="12" fill={INK} />
      <rect x="30" y="180" width="340" height="12" fill={INK} />
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <rect x={44 + i * 110} y={92} width={96} height={88} fill={STEEL} opacity="0.16" />
          <rect x={44 + i * 110} y={92} width={96} height={88} fill="none" stroke={STEEL} opacity="0.5" />
        </g>
      ))}
      <line x1="38" y1="90" x2="362" y2="90" stroke={GRAPHITE} strokeWidth="2" />
      <line x1="0" y1="252" x2="400" y2="252" stroke={HAIRLINE} />
    </g>,
  ];

  return (
    <svg viewBox="0 0 400 300" className="h-auto w-full" role="img" aria-label="Reference project illustration">
      {scenes[index % scenes.length]}
    </svg>
  );
}
