/**
 * Fixed, full-viewport metallic backdrop. The "clouds" are generated procedurally
 * with SVG fractal noise (feTurbulence), tinted cool silver and faded toward the
 * top, over a gunmetal base with a polished sheen. No image files, fully dark, so
 * the white UI and Chrome-colored accents stay readable on top of it.
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
          {/* Procedural chrome clouds */}
          <filter id="mb-clouds" x="-20%" y="-20%" width="140%" height="140%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.010 0.015"
              numOctaves={4}
              seed={11}
              stitchTiles="stitch"
              result="noise"
            />
            {/* constant cool-silver RGB, alpha taken (and thresholded) from the noise */}
            <feColorMatrix
              in="noise"
              type="matrix"
              values="0 0 0 0 0.82
                      0 0 0 0 0.87
                      0 0 0 0 0.96
                      0 0 0 0.6 -0.14"
            />
          </filter>

          {/* fade the clouds out as they descend */}
          <linearGradient id="mb-fade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fff" stopOpacity="1" />
            <stop offset="38%" stopColor="#fff" stopOpacity="0.5" />
            <stop offset="70%" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <mask id="mb-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="url(#mb-fade)" />
          </mask>

          {/* base gunmetal gradient + polished sheen */}
          <linearGradient id="mb-base" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#15171f" />
            <stop offset="58%" stopColor="#0a0b0e" />
            <stop offset="100%" stopColor="#08090b" />
          </linearGradient>
          <radialGradient id="mb-sheen" cx="50%" cy="-6%" r="70%">
            <stop offset="0%" stopColor="#e2e8f3" stopOpacity="0.18" />
            <stop offset="55%" stopColor="#aeb8c8" stopOpacity="0.045" />
            <stop offset="100%" stopColor="#aeb8c8" stopOpacity="0" />
          </radialGradient>
        </defs>

        <rect x="0" y="0" width="100%" height="100%" fill="url(#mb-base)" />
        <rect x="0" y="0" width="100%" height="100%" fill="url(#mb-sheen)" />
        <g className="metal-backdrop-clouds">
          <rect x="0" y="0" width="100%" height="100%" filter="url(#mb-clouds)" mask="url(#mb-mask)" opacity="0.6" />
        </g>
      </svg>
    </div>
  );
}
