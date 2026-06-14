/** Tiny logging helpers so a capture run is easy to follow. */
export const step = (msg: string) => console.log(`\n▶ ${msg}`);
export const info = (msg: string) => console.log(`    ${msg}`);
export const ok = (msg: string) => console.log(`  ✓ ${msg}`);
export const warn = (msg: string) => console.log(`  ! ${msg}`);
