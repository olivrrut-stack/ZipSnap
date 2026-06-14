// Generates a 128x128 PNG icon for the sample extension, with no dependencies.
// Draws a purple square with a lighter diagonal gradient and a white "spark".
// Run: node scripts/make-fixture-icon.js
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const SIZE = 128;

// --- CRC32 (PNG chunks require it) ---
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

// --- Build raw RGBA pixels ---
const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1)); // +1 filter byte per row
let p = 0;
for (let y = 0; y < SIZE; y++) {
  raw[p++] = 0; // filter type 0 (none) at start of each row
  for (let x = 0; x < SIZE; x++) {
    // diagonal gradient between two purples
    const t = (x + y) / (2 * SIZE);
    let r = Math.round(0x6d + t * (0x9b - 0x6d));
    let g = Math.round(0x5e + t * (0x8b - 0x5e));
    let b = Math.round(0xfc + t * (0xff - 0xfc));
    // white four-point spark in the center
    const cx = x - SIZE / 2;
    const cy = y - SIZE / 2;
    const dist = Math.abs(cx) + Math.abs(cy);
    const onAxis = Math.abs(cx) < 6 || Math.abs(cy) < 6;
    if (onAxis && dist < 40) {
      r = g = b = 255;
    }
    raw[p++] = r;
    raw[p++] = g;
    raw[p++] = b;
    raw[p++] = 255;
  }
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // color type RGBA
ihdr[10] = 0; // compression
ihdr[11] = 0; // filter
ihdr[12] = 0; // interlace

const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), // PNG signature
  chunk("IHDR", ihdr),
  chunk("IDAT", zlib.deflateSync(raw)),
  chunk("IEND", Buffer.alloc(0)),
]);

const out = path.resolve(__dirname, "..", "fixtures", "sample-extension", "icon128.png");
fs.writeFileSync(out, png);
console.log("Wrote", out, `(${png.length} bytes)`);
