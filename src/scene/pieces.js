// Staunton-style chess pieces built procedurally: lathe-turned bodies plus a
// few extruded / primitive details (knight head, rook merlons, crowns).
import * as THREE from 'three';

const SEG = 48;

// Builds a lathe from a list of [radius, height] points. Entries of the form
// { arc: [cx, cy, r, a0, a1] } expand into a circular arc (angles in degrees).
function lathe(spec, segments = SEG) {
  const pts = [];
  for (const p of spec) {
    if (Array.isArray(p)) { pts.push(new THREE.Vector2(p[0], p[1])); continue; }
    const [cx, cy, r, a0, a1] = p.arc;
    const n = Math.max(6, Math.round(Math.abs(a1 - a0) / 8));
    for (let i = 0; i <= n; i++) {
      const a = THREE.MathUtils.degToRad(a0 + ((a1 - a0) * i) / n);
      pts.push(new THREE.Vector2(Math.max(0, cx + r * Math.cos(a)), cy + r * Math.sin(a)));
    }
  }
  return new THREE.LatheGeometry(pts, segments);
}

// Shared turned base: foot, cove, bead. Scaled per piece.
function base(r, h = 1) {
  return [
    [0, 0], [r, 0], [r, 0.035 * h], { arc: [r - 0.02, 0.055 * h, 0.022, -20, 90] },
    [r - 0.04, 0.08 * h], [r - 0.06, 0.1 * h], { arc: [r - 0.07, 0.125 * h, 0.025, -90, 90] },
    [r - 0.1, 0.15 * h],
  ];
}

const PROFILES = {
  p: () => lathe([
    ...base(0.3),
    [0.17, 0.2], [0.12, 0.3], [0.1, 0.38],
    [0.17, 0.4], { arc: [0.17, 0.415, 0.015, -90, 90] }, [0.1, 0.43],
    [0.08, 0.46], { arc: [0, 0.57, 0.135, -55, 90] },
  ]),
  r: () => lathe([
    ...base(0.34),
    [0.25, 0.2], [0.2, 0.35], [0.19, 0.55], [0.21, 0.6],
    [0.25, 0.63], [0.25, 0.66], [0.22, 0.67], [0.24, 0.7], [0.24, 0.8], [0.17, 0.8], [0.17, 0.75], [0, 0.75],
  ]),
  b: () => lathe([
    ...base(0.32),
    [0.17, 0.22], [0.11, 0.42], [0.09, 0.58],
    [0.18, 0.6], { arc: [0.18, 0.615, 0.015, -90, 90] }, [0.1, 0.63],
    [0.09, 0.66], [0.12, 0.7], [0.145, 0.76], [0.14, 0.82], [0.11, 0.88], [0.06, 0.93], [0.03, 0.95],
    { arc: [0, 0.98, 0.04, -40, 90] },
  ]),
  q: () => lathe([
    ...base(0.36),
    [0.2, 0.22], [0.13, 0.45], [0.1, 0.72],
    [0.2, 0.75], { arc: [0.2, 0.765, 0.015, -90, 90] }, [0.12, 0.78],
    [0.11, 0.8], [0.16, 0.9], [0.21, 1.0], [0.21, 1.02], [0.15, 1.0], [0.1, 1.04], [0.06, 1.08],
    { arc: [0, 1.11, 0.05, -45, 90] },
  ]),
  k: () => lathe([
    ...base(0.37),
    [0.21, 0.22], [0.14, 0.47], [0.11, 0.76],
    [0.21, 0.79], { arc: [0.21, 0.805, 0.015, -90, 90] }, [0.13, 0.82],
    [0.12, 0.84], [0.17, 0.95], [0.19, 1.04], [0.19, 1.06], [0.14, 1.08], [0.08, 1.11], [0, 1.12],
  ]),
  n: () => lathe([
    ...base(0.34),
    [0.25, 0.2], [0.22, 0.26], [0.24, 0.28], [0.2, 0.3], [0, 0.3],
  ]),
};

function knightHead() {
  // Side silhouette of a horse head; x points toward the opponent.
  const s = new THREE.Shape();
  const pts = [
    [-0.17, 0.0], [0.19, 0.0], [0.15, 0.12], [0.06, 0.24], [0.06, 0.3],
    [0.2, 0.33], [0.27, 0.37], [0.29, 0.43], [0.25, 0.47], [0.12, 0.5],
    [0.05, 0.58], [0.02, 0.66], [-0.02, 0.7], [-0.05, 0.63], [-0.11, 0.6],
    [-0.19, 0.5], [-0.23, 0.36], [-0.23, 0.2], [-0.2, 0.08],
  ];
  s.moveTo(...pts[0]);
  const curve = new THREE.SplineCurve(pts.slice(1).map((p) => new THREE.Vector2(...p)));
  for (const p of curve.getPoints(80)) s.lineTo(p.x, p.y);
  s.lineTo(...pts[0]);
  const geo = new THREE.ExtrudeGeometry(s, {
    depth: 0.16, bevelEnabled: true, bevelThickness: 0.045, bevelSize: 0.035, bevelSegments: 5, curveSegments: 24,
  });
  geo.translate(0, 0, -0.08);
  geo.computeVertexNormals();
  return geo;
}

function addMesh(group, geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  group.add(m);
  return m;
}

const cache = new Map();
function geom(key, build) {
  if (!cache.has(key)) cache.set(key, build());
  return cache.get(key);
}

export function createMaterials() {
  const white = new THREE.MeshPhysicalMaterial({
    color: 0xdccdaa, roughness: 0.42, metalness: 0, clearcoat: 0.5, clearcoatRoughness: 0.25,
  });
  const black = new THREE.MeshPhysicalMaterial({
    color: 0x1a1513, roughness: 0.28, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08,
  });
  // Felt pad under each piece, like a real set.
  const felt = new THREE.MeshStandardMaterial({ color: 0x1f4d2b, roughness: 1 });
  return { w: white, b: black, felt };
}

/** Returns a THREE.Group for a piece; origin at the base centre. */
export function createPiece(type, color, mats) {
  const mat = mats[color];
  const g = new THREE.Group();
  addMesh(g, geom('body-' + type, PROFILES[type]), mat);
  addMesh(g, geom('felt', () => new THREE.CylinderGeometry(0.27, 0.27, 0.004, 32)), mats.felt, 0, 0.001, 0).castShadow = false;

  if (type === 'n') {
    const head = addMesh(g, geom('knight-head', knightHead), mat, 0, 0.27, 0);
    head.rotation.y = color === 'w' ? Math.PI / 2 : -Math.PI / 2;
    // Ears
    const ear = geom('ear', () => new THREE.ConeGeometry(0.035, 0.09, 12));
    for (const dz of [-0.04, 0.04]) {
      const dir = color === 'w' ? -1 : 1;
      const e = addMesh(g, ear, mat, dz, 0.97, 0.02 * dir);
      e.rotation.x = -0.25 * dir;
    }
    // Mane ridge
    const mane = addMesh(g, geom('mane', () => new THREE.CapsuleGeometry(0.03, 0.26, 4, 10)), mat, 0, 0.73, 0);
    mane.rotation.x = color === 'w' ? -0.45 : 0.45;
    mane.position.z = color === 'w' ? 0.17 : -0.17;
  }

  if (type === 'r') {
    const merlon = geom('merlon', () => new THREE.BoxGeometry(0.075, 0.07, 0.07));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const m = addMesh(g, merlon, mat, Math.cos(a) * 0.205, 0.835, Math.sin(a) * 0.205);
      m.rotation.y = -a;
    }
  }

  if (type === 'b') {
    // Mitre slit: a thin dark sliver on the head.
    const slit = addMesh(g, geom('slit', () => new THREE.BoxGeometry(0.012, 0.11, 0.3)), mats[color === 'w' ? 'b' : 'w'], 0, 0.84, 0);
    slit.rotation.x = 0.6;
    slit.scale.set(1, 1, 0.55);
    slit.castShadow = false;
  }

  if (type === 'q') {
    const ball = geom('qball', () => new THREE.SphereGeometry(0.03, 16, 12));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      addMesh(g, ball, mat, Math.cos(a) * 0.2, 1.035, Math.sin(a) * 0.2);
    }
  }

  if (type === 'k') {
    const v = geom('kcross-v', () => new THREE.BoxGeometry(0.06, 0.2, 0.06));
    const h = geom('kcross-h', () => new THREE.BoxGeometry(0.17, 0.055, 0.06));
    addMesh(g, geom('kneck', () => new THREE.CylinderGeometry(0.05, 0.07, 0.05, 24)), mat, 0, 1.14, 0);
    addMesh(g, v, mat, 0, 1.26, 0);
    addMesh(g, h, mat, 0, 1.29, 0);
  }

  g.userData = { type, color };
  return g;
}
