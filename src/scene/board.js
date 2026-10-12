// Wooden board with procedurally painted maple / walnut squares, a walnut
// frame with engraved coordinates, and a felt-topped table beneath.
import * as THREE from 'three';

export const BORDER = 0.55;
export const BOARD_SIZE = 8 + BORDER * 2;
export const BOARD_TOP = 0.32;

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

// Paints wood grain into a rectangle of a 2D context.
function paintWood(ctx, x, y, w, h, base, dark, seed, vertical) {
  const r = rng(seed);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = base;
  ctx.fillRect(x, y, w, h);
  const len = vertical ? h : w;
  const across = vertical ? w : h;
  const lines = Math.round(across / 2.2);
  const phase = r() * 100;
  for (let i = 0; i < lines; i++) {
    const off = (i / lines) * across + r() * 2;
    ctx.globalAlpha = 0.05 + r() * 0.13;
    ctx.strokeStyle = dark;
    ctx.lineWidth = 0.6 + r() * 1.6;
    ctx.beginPath();
    for (let t = 0; t <= len; t += 6) {
      const wobble = Math.sin((t / len) * 3.2 + phase + i * 0.07) * across * 0.03 + Math.sin(t * 0.05 + i) * 0.8;
      const px = vertical ? x + off + wobble : x + t;
      const py = vertical ? y + t : y + off + wobble;
      t === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.stroke();
  }
  // Pores / flecks
  ctx.globalAlpha = 0.08;
  ctx.fillStyle = dark;
  for (let i = 0; i < (w * h) / 300; i++) ctx.fillRect(x + r() * w, y + r() * h, 1 + r() * 3, 1);
  // Gentle sheen gradient
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, 'rgba(255,255,255,0.05)');
  g.addColorStop(1, 'rgba(0,0,0,0.06)');
  ctx.globalAlpha = 1;
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  ctx.restore();
}

function boardTexture(maxAniso, flipped) {
  const S = 2048;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  const u = S / BOARD_SIZE;
  // Frame
  paintWood(ctx, 0, 0, S, S, '#4a2a17', '#1d0e06', 7, false);
  const inner = BORDER * u;
  // Inlay line around the playing surface
  ctx.strokeStyle = '#c9a66b';
  ctx.lineWidth = 6;
  ctx.strokeRect(inner - 14, inner - 14, 8 * u + 28, 8 * u + 28);
  // Squares
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const light = (r + f) % 2 === 1;
      const x = inner + f * u;
      const y = inner + (7 - r) * u;
      if (light) paintWood(ctx, x, y, u, u, '#e3c393', '#a77b45', r * 8 + f + 11, (r + f) % 4 === 1);
      else paintWood(ctx, x, y, u, u, '#7b4a28', '#2e170a', r * 8 + f + 101, (r + f) % 4 === 0);
    }
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 2;
  ctx.strokeRect(inner, inner, 8 * u, 8 * u);
  // Coordinates
  ctx.fillStyle = '#d8b77e';
  ctx.font = `600 ${Math.round(u * 0.26)}px Georgia, serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const files = 'abcdefgh';
  for (let i = 0; i < 8; i++) {
    const cx = inner + i * u + u / 2;
    const cy = inner + (7 - i) * u + u / 2;
    for (const [tx, ty, rot, label] of [
      [cx, S - inner / 2, 0, files[i]],
      [cx, inner / 2, Math.PI, files[i]],
      [inner / 2, cy, 0, String(i + 1)],
      [S - inner / 2, cy, Math.PI, String(i + 1)],
    ]) {
      ctx.save();
      ctx.translate(tx, ty);
      ctx.rotate(rot + (flipped ? Math.PI : 0));
      ctx.fillText(label, 0, 0);
      ctx.restore();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso;
  return tex;
}

function sideTexture(maxAniso) {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 64;
  paintWood(c.getContext('2d'), 0, 0, 1024, 64, '#3f2313', '#170a04', 3, false);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso;
  return tex;
}

function tableTexture(maxAniso) {
  const c = document.createElement('canvas');
  c.width = c.height = 1024;
  const ctx = c.getContext('2d');
  for (let i = 0; i < 8; i++) paintWood(ctx, 0, i * 128, 1024, 128, i % 2 ? '#2a1a12' : '#2e1d14', '#0e0705', 50 + i, false);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  tex.anisotropy = maxAniso;
  return tex;
}

export function createBoard(renderer) {
  const aniso = renderer.capabilities.getMaxAnisotropy();
  const group = new THREE.Group();

  const topMat = new THREE.MeshPhysicalMaterial({
    map: boardTexture(aniso, false), roughness: 0.38, clearcoat: 0.55, clearcoatRoughness: 0.22,
  });
  const sideMat = new THREE.MeshPhysicalMaterial({ map: sideTexture(aniso), roughness: 0.45, clearcoat: 0.4 });
  const bottomMat = new THREE.MeshStandardMaterial({ color: 0x2a170c, roughness: 0.9 });
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(BOARD_SIZE, BOARD_TOP, BOARD_SIZE),
    [sideMat, sideMat, topMat, bottomMat, sideMat, sideMat],
  );
  box.position.y = BOARD_TOP / 2;
  box.receiveShadow = true;
  box.castShadow = true;
  group.add(box);

  // Table
  const table = new THREE.Mesh(
    new THREE.CircleGeometry(40, 64),
    new THREE.MeshStandardMaterial({ map: tableTexture(aniso), roughness: 0.55 }),
  );
  table.rotation.x = -Math.PI / 2;
  table.receiveShadow = true;
  group.add(table);

  // Invisible pick plane matching the playing surface.
  const pick = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.MeshBasicMaterial({ visible: false }));
  pick.rotation.x = -Math.PI / 2;
  pick.position.y = BOARD_TOP + 0.001;
  pick.name = 'pick';
  group.add(pick);

  return { group, pick, topMat, flipLabels: (flipped) => {
    topMat.map.dispose();
    topMat.map = boardTexture(aniso, flipped);
    topMat.needsUpdate = true;
  } };
}

/** Square name (e.g. "e4") to world-space x/z of its centre. */
export function squareToWorld(sq) {
  const f = sq.charCodeAt(0) - 97;
  const r = sq.charCodeAt(1) - 49;
  return new THREE.Vector3(f - 3.5, BOARD_TOP, 3.5 - r);
}

export function worldToSquare(x, z) {
  const f = Math.floor(x + 4);
  const r = Math.floor(4 - z);
  if (f < 0 || f > 7 || r < 0 || r > 7) return null;
  return 'abcdefgh'[f] + (r + 1);
}
