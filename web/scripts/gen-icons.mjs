// Sinh icon PNG cho PWA từ ký hiệu thương hiệu (trăng lưỡi liềm + sao) — chỉ dùng Node (zlib), không thư viện.
// Chạy: node web/scripts/gen-icons.mjs  → public/icons/*.png
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "../../public/icons");
const BG = [0x14, 0x10, 0x0e]; // --bg (tối)
const TILE = [0x2a, 0x21, 0x1c]; // --surface-2
const MOON = [0xf1, 0xaa, 0x4c]; // --accent
const STAR = [0xf4, 0xe8, 0xd8]; // --text

/* ---------- Hình học (hệ toạ độ 32×32 như BrandMark) ---------- */
function arcPoints(x1, y1, r, large, sweep, x2, y2, steps = 96) {
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const sq = Math.max(0, (r * r * r * r - r * r * dy * dy - r * r * dx * dx) / (r * r * dy * dy + r * r * dx * dx));
  const coef = (large !== sweep ? 1 : -1) * Math.sqrt(sq);
  const cxp = coef * dy;
  const cyp = -coef * dx;
  const cx = cxp + (x1 + x2) / 2;
  const cy = cyp + (y1 + y2) / 2;
  const a1 = Math.atan2((dy - cyp) / r, (dx - cxp) / r);
  let da = Math.atan2((-dy - cyp) / r, (-dx - cxp) / r) - a1;
  if (!sweep && da > 0) da -= 2 * Math.PI;
  if (sweep && da < 0) da += 2 * Math.PI;
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const a = a1 + (da * i) / steps;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
}

// "M20 7a9.5 9.5 0 1 0 5.3 16.9A8.4 8.4 0 0 1 20 7z"
const MOON_POLY = [...arcPoints(20, 7, 9.5, 1, 0, 25.3, 23.9), ...arcPoints(25.3, 23.9, 8.4, 0, 1, 20, 7)];

function inPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function inRoundRect(x, y, w, h, r) {
  if (x < 0 || y < 0 || x > w || y > h) return false;
  const cx = Math.min(Math.max(x, r), w - r);
  const cy = Math.min(Math.max(y, r), h - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

/** Màu tại điểm (u,v) trong hệ 32×32; null = trong suốt. */
function sample(u, v, { fullBleed }) {
  const inTile = fullBleed ? true : inRoundRect(u, v, 32, 32, 9);
  if (!inTile) return null;
  if ((u - 23.5) ** 2 + (v - 9) ** 2 <= 1.3 ** 2) return STAR;
  if ((u - 26.5) ** 2 + (v - 14) ** 2 <= 0.9 ** 2) return STAR;
  if (inPoly(u, v, MOON_POLY)) return MOON;
  return fullBleed ? BG : TILE;
}

/** Vẽ size×size; scale = tỉ lệ ký hiệu so với khung (maskable cần vùng an toàn ~80%). */
function render(size, { fullBleed = false, scale = 1 } = {}) {
  const px = new Uint8Array(size * size * 4);
  const SS = 4; // siêu lấy mẫu 4×4 để khử răng cưa
  const k = 32 / (size * scale);
  const off = (size * (1 - scale)) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const u = (x + (sx + 0.5) / SS - off) * k;
          const v = (y + (sy + 0.5) / SS - off) * k;
          let c = u < 0 || v < 0 || u > 32 || v > 32 ? (fullBleed ? BG : null) : sample(u, v, { fullBleed });
          if (!c) continue;
          r += c[0];
          g += c[1];
          b += c[2];
          a++;
        }
      }
      const i = (y * size + x) * 4;
      if (a) {
        px[i] = Math.round(r / a);
        px[i + 1] = Math.round(g / a);
        px[i + 2] = Math.round(b / a);
      }
      px[i + 3] = Math.round((a / (SS * SS)) * 255);
    }
  }
  return px;
}

/* ---------- Mã hoá PNG ---------- */
const CRC_TABLE = (() => {
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
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // 8 bit
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // bộ lọc None
    Buffer.from(rgba.buffer, y * size * 4, size * 4).copy(raw, y * (size * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

mkdirSync(OUT, { recursive: true });
const jobs = [
  ["icon-192.png", 192, {}],
  ["icon-512.png", 512, {}],
  ["icon-maskable-512.png", 512, { fullBleed: true, scale: 0.78 }],
  ["apple-touch-icon.png", 180, { fullBleed: true, scale: 0.86 }],
];
for (const [name, size, opt] of jobs) {
  writeFileSync(join(OUT, name), png(size, render(size, opt)));
  console.log("đã ghi", name);
}
