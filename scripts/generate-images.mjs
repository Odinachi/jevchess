// Regenerates every raster brand image from code: app icons (from public/favicon.svg)
// and the 1200×630 social preview card (public/og-image.jpg).
// Usage: npm run images
import { Resvg } from '@resvg/resvg-js';
import { readFileSync, writeFileSync } from 'node:fs';
import jpeg from 'jpeg-js';

const PUBLIC = new URL('../public/', import.meta.url);
const favicon = readFileSync(new URL('favicon.svg', PUBLIC), 'utf8');

function png(svg, width, file) {
  const out = new Resvg(svg, {
    fitTo: { mode: 'width', value: width },
    font: { loadSystemFonts: true, defaultFontFamily: 'Helvetica Neue' },
  }).render().asPng();
  writeFileSync(new URL(file, PUBLIC), out);
  console.log(`${file.padEnd(24)} ${width}px  ${(out.length / 1024).toFixed(1)} KB`);
}

// ---------- App icons ----------
// Home-screen icons are full-bleed squares: iOS/Android apply their own corner mask.
const square = favicon
  .replace('rx="14"', 'rx="0"')
  .replace('x="1" y="1" width="62" height="62"', 'x="0" y="0" width="64" height="64"')
  .replace(/<rect x="2.5"[^>]*\/>/, '');
// Maskable icons must keep the artwork inside the central 80% safe zone.
const maskable = square
  .replace('<!-- Knight -->', '<g transform="translate(32 32) scale(0.78) translate(-32 -31)">')
  .replace('</svg>', '</g></svg>');

png(favicon, 32, 'favicon-32.png');
png(square, 180, 'apple-touch-icon.png');
png(square, 192, 'icon-192.png');
png(square, 512, 'icon-512.png');
png(maskable, 512, 'icon-maskable-512.png');

// ---------- Social preview card ----------
const W = 1200, H = 630;
const KNIGHT = favicon.match(/<path fill="url\(#gold\)" d="([^"]+)"/)[1];

// Perspective projection of the board plane (x, z in squares, z = 0 is the near edge).
const cx = 905, horizonY = -340, nearY = 640, nearHalf = 360, depth = 8 * 1.6;
function project(x, z) {
  const s = 1 / (1 + z / depth * 1.25);
  return [cx + (x - 4) * (nearHalf / 4) * s, horizonY + (nearY - horizonY) * s];
}
const poly = (pts) => pts.map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' ');

let board = '';
// Frame
const f = 0.45;
board += `<polygon points="${poly([project(-f, -f), project(8 + f, -f), project(8 + f, 8 + f), project(-f, 8 + f)])}" fill="#3a2212" stroke="#c9a66b" stroke-opacity="0.5" stroke-width="2"/>`;
for (let r = 0; r < 8; r++) {
  for (let c = 0; c < 8; c++) {
    const light = (r + c) % 2 === 1;
    const pts = [project(c, r), project(c + 1, r), project(c + 1, r + 1), project(c, r + 1)];
    board += `<polygon points="${poly(pts)}" fill="${light ? 'url(#lightSq)' : 'url(#darkSq)'}"/>`;
  }
}

// Pieces (drawn back to front): knight path is in a 64-unit box, base at y≈53.
function piece(c, r, color, size = 1) {
  const [x, y] = project(c + 0.5, r + 0.5);
  const scale = (project(c + 1, r)[0] - project(c, r)[0]) / 64 * 1.55 * size;
  const shadow = `<ellipse cx="${x}" cy="${y + 2}" rx="${22 * scale}" ry="${7 * scale}" fill="#000" opacity="0.35"/>`;
  const fill = color === 'w' ? 'url(#ivory)' : 'url(#ebony)';
  const flip = color === 'b' ? `translate(${64} 0) scale(-1 1)` : '';
  return `${shadow}<g transform="translate(${x - 32 * scale} ${y - 53 * scale}) scale(${scale}) ${flip}">
    <path d="${KNIGHT}" fill="${fill}" stroke="${color === 'w' ? '#8a6a3a' : '#000'}" stroke-opacity="0.35" stroke-width="0.6"/>
    <circle cx="26.2" cy="24.6" r="1.6" fill="${color === 'w' ? '#3a2a18' : '#d9c79e'}"/>
  </g>`;
}
const pieces = [piece(5, 6, 'b', 0.95), piece(2, 5, 'b', 0.95), piece(4, 2, 'w', 1.05)].join('');

const chips = ['Beginner', 'Pro', 'Legendary'].map((label, i) => {
  const widths = [150, 86, 162];
  const x = 80 + widths.slice(0, i).reduce((a, b) => a + b + 14, 0);
  return `<g transform="translate(${x} 430)">
    <rect width="${widths[i]}" height="48" rx="24" fill="#e8c170" fill-opacity="${i === 2 ? 0.18 : 0.07}" stroke="#e8c170" stroke-opacity="${i === 2 ? 0.8 : 0.35}" stroke-width="2"/>
    <text x="${widths[i] / 2}" y="32" text-anchor="middle" font-size="22" font-weight="600" fill="${i === 2 ? '#f3d48a' : '#e6dfd3'}">${label}</text>
  </g>`;
}).join('');

const og = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Avenir Next, Helvetica Neue, Arial, sans-serif">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0d0f12"/><stop offset="1" stop-color="#1f150d"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.78" cy="0.35" r="0.6">
      <stop offset="0" stop-color="#e8c170" stop-opacity="0.22"/><stop offset="1" stop-color="#e8c170" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="lightSq" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ecd1a2"/><stop offset="1" stop-color="#d5b07a"/></linearGradient>
    <linearGradient id="darkSq" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8a5530"/><stop offset="1" stop-color="#6a3d1f"/></linearGradient>
    <linearGradient id="ivory" x1="0" y1="0" x2="0.6" y2="1"><stop offset="0" stop-color="#fff6e0"/><stop offset="1" stop-color="#cdb98f"/></linearGradient>
    <linearGradient id="ebony" x1="0" y1="0" x2="0.6" y2="1"><stop offset="0" stop-color="#4a403a"/><stop offset="1" stop-color="#0f0b09"/></linearGradient>
    <linearGradient id="fadeL" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0.36" stop-color="#0d0f12" stop-opacity="1"/><stop offset="0.6" stop-color="#0d0f12" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="fadeT" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0d0f12" stop-opacity="0.9"/><stop offset="0.35" stop-color="#0d0f12" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <g>${board}${pieces}</g>
  <rect width="${W}" height="${H}" fill="url(#fadeT)"/>
  <rect width="${W}" height="${H}" fill="url(#fadeL)"/>

  <g transform="translate(80 92)">${favicon.replace(/<\?xml[^>]*>/, '').replace('<svg ', '<svg width="84" height="84" ')}</g>
  <text x="80" y="268" font-size="96" font-weight="800" fill="#f1ece3" letter-spacing="-2">Jev<tspan fill="#e8c170">Chess</tspan></text>
  <text x="82" y="330" font-size="34" font-weight="500" fill="#d6cfc3">Realistic 3D chess against</text>
  <text x="82" y="376" font-size="34" font-weight="700" fill="#c9a7ff">TypeSafe Jev</text>
  ${chips}
  <text x="82" y="548" font-size="22" fill="#9d968b">Free · in your browser · phone or desktop</text>
</svg>`;

// JPEG keeps the card well under WhatsApp's ~300 KB preview limit.
const img = new Resvg(og, { font: { loadSystemFonts: true, defaultFontFamily: 'Helvetica Neue' } }).render();
const jpg = jpeg.encode({ data: img.pixels, width: img.width, height: img.height }, 88).data;
writeFileSync(new URL('og-image.jpg', PUBLIC), jpg);
console.log(`${'og-image.jpg'.padEnd(24)} ${W}px  ${(jpg.length / 1024).toFixed(1)} KB`);
