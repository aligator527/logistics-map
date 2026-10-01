// Draws lines and point markers into Web Mercator PNG tiles ({z}/{x}/{y}.png, 256 px), in headless Chromium.
// Used for the 非商用 国土数値情報 layers (N10, N12, C02, P31): the site shows them as pictures only, so the
// browser never receives their coordinates (国土情報提供サイト運営事務局, 2026-10: layer display is not
// redistribution; data the viewer can download — vector tiles, APIs — may be).
//
//   await renderTiles({ out, zooms: [5, 12], palette: ['#rrggbb', …], lines: [{ coords: [[lon, lat], …], style }], points: [{ lon, lat, … }] })
//   style: { color, width: (z) => px, alpha?, dash?: (z) => [px, px] | null, minZ? }
//   point: { lon, lat, kind: 'port' | 'rail', r: (z) => px, minZ? }
// Tiles are 8-bit palette PNGs (the palette's colours × 16 alpha levels; a fifth of the size of the canvas's own PNGs).
// Writes the tiles and index.json ({ "z": ["x/y", …] }: which tiles exist, so the page never asks for a missing one).
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { deflateSync } from 'node:zlib';
import { chromium } from '@playwright/test';

// ------------------------------------------------------------ palette PNG
const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc = (b) => { let c = -1; for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const chunk = (type, data) => {
  const len = Buffer.alloc(4), sum = Buffer.alloc(4), td = Buffer.concat([Buffer.from(type), data]);
  len.writeUInt32BE(data.length); sum.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, sum]);
};
const LEVELS = 16;
/** RGBA (straight alpha) → indexed PNG: each pixel takes the nearest palette colour and its alpha in 16 steps */
function palettePng(rgba, colours) {
  const rgb = colours.map((h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)));
  const plte = [], trns = [];
  for (const c of rgb) for (let a = 0; a < LEVELS; a++) { plte.push(...c); trns.push(Math.round((a * 255) / (LEVELS - 1))); }
  const rows = Buffer.alloc(256 * 257);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const i = (y * 256 + x) * 4, a = rgba[i + 3];
    let best = 0;
    if (a) {
      let bd = Infinity;
      for (let k = 0; k < rgb.length; k++) { const c = rgb[k], d = (c[0] - rgba[i]) ** 2 + (c[1] - rgba[i + 1]) ** 2 + (c[2] - rgba[i + 2]) ** 2; if (d < bd) { bd = d; best = k; } }
    }
    rows[y * 257 + 1 + x] = best * LEVELS + Math.round((a * (LEVELS - 1)) / 255);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(256, 0); ihdr.writeUInt32BE(256, 4); ihdr[8] = 8; ihdr[9] = 3;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('PLTE', Buffer.from(plte)),
    chunk('tRNS', Buffer.from(trns)), chunk('IDAT', deflateSync(rows, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const lon2x = (lon, z) => ((lon + 180) / 360) * 2 ** z * 256;
const lat2y = (lat, z) => { const s = Math.sin((lat * Math.PI) / 180); return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * 2 ** z * 256; };

/** the drawing code, run in the page: one tile = a list of ops in tile pixels */
function drawTile(ops) {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 256;
  const c = cv.getContext('2d');
  c.lineJoin = 'round'; c.lineCap = 'round';
  for (const o of ops) {
    if (o.t === 'line') {
      c.globalAlpha = o.alpha; c.strokeStyle = o.color; c.lineWidth = o.width;
      c.setLineDash(o.dash ?? []); c.lineDashOffset = o.offset ?? 0;
      c.lineCap = o.dash ? 'butt' : 'round';
      c.beginPath();
      for (let i = 0; i < o.p.length; i += 2) (i ? c.lineTo : c.moveTo).call(c, o.p[i], o.p[i + 1]);
      c.stroke();
    } else {
      // the same markers as the map's vector ones (MapView .poi): white body, coloured outline and glyph
      const { x, y, r } = o;
      c.globalAlpha = 1; c.setLineDash([]); c.lineCap = 'round';
      c.fillStyle = '#ffffff'; c.strokeStyle = o.color; c.lineWidth = 1.6;
      c.beginPath();
      if (o.kind === 'port') c.roundRect(x - r, y - r, 2 * r, 2 * r, r * 0.35); else c.roundRect(x - r, y - r * 0.7, 2 * r, 1.4 * r, 1.5);
      c.fill(); c.stroke();
      c.lineWidth = 1.3; c.beginPath();
      const s = r / 6;
      if (o.kind === 'port') {
        c.moveTo(x, y - 3.6 * s); c.lineTo(x, y + 3.6 * s); c.moveTo(x - 2.4 * s, y - 1.4 * s); c.lineTo(x + 2.4 * s, y - 1.4 * s);
        c.moveTo(x - 3.4 * s, y + 1.4 * s); c.quadraticCurveTo(x, y + 4.8 * s, x + 3.4 * s, y + 1.4 * s);
      } else { c.moveTo(x - 3.6 * s, y); c.lineTo(x + 3.6 * s, y); }
      c.stroke();
    }
  }
  // straight-alpha RGBA, as base64
  const d = c.getImageData(0, 0, 256, 256).data;
  let s = '';
  for (let i = 0; i < d.length; i += 0x8000) s += String.fromCharCode.apply(null, d.subarray(i, i + 0x8000));
  return btoa(s);
}

export async function renderTiles({ out, zooms: [z0, z1], palette, lines = [], points = [] }) {
  rmSync(out, { recursive: true, force: true });
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.addScriptTag({ content: `window.drawTile = ${drawTile.toString()}` });
  const index = {};
  let files = 0, bytes = 0;
  for (let z = z0; z <= z1; z++) {
    /** tile key → ops, in drawing order (lines in the given order, then points) */
    const tiles = new Map();
    const add = (tx, ty, op) => { const k = `${tx}/${ty}`; (tiles.get(k) ?? tiles.set(k, []).get(k)).push(op); };
    for (const { coords, style } of lines) {
      if (style.minZ && z < style.minZ) continue;
      const w = style.width(z), dash = style.dash?.(z) ?? null, m = w + 2;
      const px = coords.map(([lon, lat]) => [lon2x(lon, z), lat2y(lat, z)]);
      // distance along the line, so dashes run on across tile edges
      const cum = [0];
      for (let i = 1; i < px.length; i++) cum.push(cum[i - 1] + Math.hypot(px[i][0] - px[i - 1][0], px[i][1] - px[i - 1][1]));
      // per tile: runs of consecutive segments that touch it (with the line width as margin)
      const runs = new Map();
      for (let i = 1; i < px.length; i++) {
        const [ax, ay] = px[i - 1], [bx, by] = px[i];
        const tx0 = Math.floor((Math.min(ax, bx) - m) / 256), tx1 = Math.floor((Math.max(ax, bx) + m) / 256);
        const ty0 = Math.floor((Math.min(ay, by) - m) / 256), ty1 = Math.floor((Math.max(ay, by) + m) / 256);
        for (let tx = tx0; tx <= tx1; tx++) for (let ty = ty0; ty <= ty1; ty++) {
          const k = `${tx}/${ty}`, list = runs.get(k) ?? runs.set(k, []).get(k), last = list.at(-1);
          if (last && last.end === i - 1) last.end = i; else list.push({ start: i - 1, end: i });
        }
      }
      for (const [k, list] of runs) {
        const [tx, ty] = k.split('/').map(Number);
        for (const { start, end } of list) {
          const p = [];
          for (let i = start; i <= end; i++) p.push(Math.round((px[i][0] - tx * 256) * 10) / 10, Math.round((px[i][1] - ty * 256) * 10) / 10);
          add(tx, ty, { t: 'line', p, color: style.color, width: w, alpha: style.alpha ?? 1, dash, offset: dash ? cum[start] % (dash[0] + dash[1]) : 0 });
        }
      }
    }
    for (const pt of points) {
      if (pt.minZ && z < pt.minZ) continue;
      const x = lon2x(pt.lon, z), y = lat2y(pt.lat, z), r = pt.r(z), m = r + 2;
      for (let tx = Math.floor((x - m) / 256); tx <= Math.floor((x + m) / 256); tx++)
        for (let ty = Math.floor((y - m) / 256); ty <= Math.floor((y + m) / 256); ty++)
          add(tx, ty, { t: 'pt', kind: pt.kind, color: pt.color, x: x - tx * 256, y: y - ty * 256, r });
    }
    const keys = [...tiles.keys()].sort();
    index[z] = keys;
    for (let b = 0; b < keys.length; b += 50) {
      const batch = keys.slice(b, b + 50);
      const pngs = await page.evaluate((list) => list.map((ops) => window.drawTile(ops)), batch.map((k) => tiles.get(k)));
      batch.forEach((k, j) => {
        const [tx, ty] = k.split('/');
        mkdirSync(resolve(out, String(z), tx), { recursive: true });
        const buf = palettePng(Buffer.from(pngs[j], 'base64'), palette);
        writeFileSync(resolve(out, String(z), tx, `${ty}.png`), buf);
        files++; bytes += buf.length;
      });
    }
    console.log(`  z${z}: ${keys.length} tiles`);
  }
  await browser.close();
  writeFileSync(resolve(out, 'index.json'), JSON.stringify(index));
  return { files, bytes };
}
