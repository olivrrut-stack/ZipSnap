/**
 * Fixed, full-viewport metallic backdrop: a gunmetal base, the technical grid, a
 * polished sheen up top, and a FEW large, sparse procedural "chrome clouds" (SVG
 * fractal noise confined to soft blobs) rather than a screen-wide fog. No image
 * files; stays dark so the white UI and Chrome-colored accents read cleanly.
 */
export default function MetalBackdrop() {
  return (
    <div aria-hidden className="metal-backdrop">
      <svg
        className="metal-backdrop-svg"
        preserveAspectRatio="xMidYMid slice"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="mb-base" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#14161d" />
            <stop offset="58%" stopColor="#0a0b0e" />
            <stop offset="100%" stopColor="#08090b" />
          </linearGradient>
          <radialGradient id="mb-sheen" cx="50%" cy="-6%" r="70%">
            <stop offset="0%" stopColor="#e2e8f3" stopOpacity="0.15" />
            <stop offset="55%" stopColor="#aeb8c8" stopOpacity="0.04" />
            <stop offset="100%" stopColor="#aeb8c8" stopOpacity="0" />
          </radialGradient>

          {/* technical grid */}
          <pattern id="mb-grid" width="46" height="46" patternUnits="userSpaceOnUse">
            <path d="M46 0 H0 V46" fill="none" stroke="#96a5c0" strokeOpacity="0.05" strokeWidth="1" />
          </pattern>

          {/* soft blob that confines each cloud to a large, soft-edged region */}
          <radialGradient id="mb-blob" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#fff" stopOpacity="1" />
            <stop offset="50%" stopColor="#fff" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
          <filter id="mb-cloud" x="-40%" y="-40%" width="180%" height="180%">
            <feTurbulence type="fractalNoise" baseFrequency="0.006 0.009" numOctaves={4} seed={6} stitchTiles="stitch" result="n" />
            <feColorMatrix in="n" type="matrix" values="0 0 0 0 0.82  0 0 0 0 0.87  0 0 0 0 0.97  0 0 0 0.9 -0.08" result="tex" />
            <feComposite in="tex" in2="SourceGraphic" operator="in" result="clip" />
            <feGaussianBlur in="clip" stdDeviation="1.4" />
          </filter>
        </defs>

        <rect width="100%" height="100%" fill="url(#mb-base)" />
        <rect width="100%" height="100%" fill="url(#mb-grid)" />
        <rect width="100%" height="100%" fill="url(#mb-sheen)" />

        {/* a couple of large, sparse clouds near the top */}
        <g className="metal-backdrop-clouds" opacity="0.6">
          <ellipse cx="30%" cy="12%" rx="33%" ry="15%" fill="url(#mb-blob)" filter="url(#mb-cloud)" />
          <ellipse cx="81%" cy="6%" rx="24%" ry="12%" fill="url(#mb-blob)" filter="url(#mb-cloud)" />
          <ellipse cx="58%" cy="25%" rx="21%" ry="10%" fill="url(#mb-blob)" filter="url(#mb-cloud)" />
        </g>
      </svg>
    </div>
  );
}
