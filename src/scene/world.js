import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { createBoard, squareToWorld, worldToSquare, BOARD_TOP, BOARD_SIZE } from './board.js';
import { createPiece, createMaterials } from './pieces.js';

const isTouch = matchMedia('(pointer: coarse)').matches;

function discTexture(draw) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  draw(c.getContext('2d'));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export class World {
  constructor(container, { onSquareTap }) {
    this.container = container;
    this.onSquareTap = onSquareTap;
    this.pieces = new Map(); // square -> Group
    this.tweens = [];
    this.orientation = 'w';

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio, isTouch ? 2 : 2.5));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);
    this.renderer = renderer;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0d0f12);
    scene.fog = new THREE.Fog(0x0d0f12, 18, 42);
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.55;
    this.scene = scene;

    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    this.camera = camera;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.minPolarAngle = 0.05;
    controls.maxPolarAngle = 1.25;
    controls.rotateSpeed = isTouch ? 0.6 : 0.8;
    controls.target.set(0, BOARD_TOP, 0);
    this.controls = controls;

    // Lighting: warm key with soft shadows, cool fill, gentle overhead.
    const key = new THREE.DirectionalLight(0xfff1dc, 2.0);
    key.position.set(-6, 14, 7);
    key.castShadow = true;
    key.shadow.mapSize.set(isTouch ? 1024 : 2048, isTouch ? 1024 : 2048);
    const sc = key.shadow.camera;
    sc.left = sc.bottom = -7; sc.right = sc.top = 7; sc.near = 1; sc.far = 40;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.02;
    key.shadow.radius = 4;
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xbcd2ff, 0.5);
    fill.position.set(8, 6, -6);
    scene.add(fill);
    scene.add(new THREE.HemisphereLight(0xfff4e6, 0x1a120c, 0.35));
    const spot = new THREE.SpotLight(0xffe2b8, 25, 30, 0.6, 0.6, 1.6);
    spot.position.set(0, 13, 0);
    spot.target.position.set(0, 0, 0);
    scene.add(spot, spot.target);

    const board = createBoard(renderer);
    scene.add(board.group);
    this.board = board;
    this.mats = createMaterials();

    this.buildHighlights();

    // Picking: tap = pointer up with little movement (so orbiting doesn't select).
    this.raycaster = new THREE.Raycaster();
    let down = null;
    const el = renderer.domElement;
    el.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
    el.addEventListener('pointerup', (e) => {
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      down = null;
      if (moved > (isTouch ? 12 : 6)) return;
      const sq = this.pickSquare(e);
      if (sq) this.onSquareTap(sq);
    });

    this.resize = this.resize.bind(this);
    window.addEventListener('resize', this.resize);
    new ResizeObserver(this.resize).observe(container);
    this.resize();
    this.setOrientation('w', false);

    this.clock = new THREE.Clock();
    renderer.setAnimationLoop(() => this.tick());
  }

  buildHighlights() {
    const y = BOARD_TOP + 0.004;
    const mk = (tex, size = 1, opacity = 1) => {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(size, size),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity, depthWrite: false, toneMapped: false }),
      );
      m.rotation.x = -Math.PI / 2;
      m.position.y = y;
      m.visible = false;
      m.renderOrder = 2;
      this.scene.add(m);
      return m;
    };
    this.texDot = discTexture((c) => {
      c.fillStyle = 'rgba(30,30,30,0.42)';
      c.beginPath(); c.arc(64, 64, 18, 0, Math.PI * 2); c.fill();
    });
    this.texRing = discTexture((c) => {
      c.strokeStyle = 'rgba(30,30,30,0.45)';
      c.lineWidth = 12;
      c.beginPath(); c.arc(64, 64, 54, 0, Math.PI * 2); c.stroke();
    });
    const texSquare = (color) => discTexture((c) => { c.fillStyle = color; c.fillRect(0, 0, 128, 128); });
    const texCheck = discTexture((c) => {
      const g = c.createRadialGradient(64, 64, 4, 64, 64, 64);
      g.addColorStop(0, 'rgba(255,40,30,0.95)');
      g.addColorStop(0.5, 'rgba(230,20,10,0.55)');
      g.addColorStop(1, 'rgba(200,0,0,0)');
      c.fillStyle = g; c.fillRect(0, 0, 128, 128);
    });
    this.hlSelected = mk(texSquare('rgba(120,200,90,0.55)'));
    this.hlLast = [mk(texSquare('rgba(250,210,70,0.4)')), mk(texSquare('rgba(250,210,70,0.4)'))];
    this.hlCheck = mk(texCheck, 1.15);
    this.hlTargets = [];
  }

  setHighlights({ selected = null, targets = [], lastMove = null, check = null } = {}) {
    const place = (m, sq) => {
      if (!sq) { m.visible = false; return; }
      const p = squareToWorld(sq);
      m.position.x = p.x; m.position.z = p.z;
      m.visible = true;
    };
    place(this.hlSelected, selected);
    place(this.hlLast[0], lastMove?.[0]);
    place(this.hlLast[1], lastMove?.[1]);
    place(this.hlCheck, check);
    while (this.hlTargets.length < targets.length) {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false }),
      );
      m.rotation.x = -Math.PI / 2;
      m.position.y = BOARD_TOP + 0.006;
      m.renderOrder = 3;
      this.scene.add(m);
      this.hlTargets.push(m);
    }
    this.hlTargets.forEach((m, i) => {
      const t = targets[i];
      if (!t) { m.visible = false; return; }
      m.material.map = t.capture ? this.texRing : this.texDot;
      m.material.needsUpdate = true;
      place(m, t.sq);
    });
  }

  pickSquare(e) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    // Tapping a piece's body counts as tapping its square.
    const meshes = [];
    for (const g of this.pieces.values()) g.traverse((o) => o.isMesh && meshes.push(o));
    const hitPiece = this.raycaster.intersectObjects(meshes, false)[0];
    if (hitPiece) {
      let g = hitPiece.object;
      while (g.parent && !g.userData.square) g = g.parent;
      if (g.userData.square) return g.userData.square;
    }
    const hit = this.raycaster.intersectObject(this.board.pick, false)[0];
    return hit ? worldToSquare(hit.point.x, hit.point.z) : null;
  }

  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Fit the whole board horizontally on narrow (portrait) screens.
    const vFov = THREE.MathUtils.degToRad(this.camera.fov);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * this.camera.aspect);
    const need = BOARD_SIZE * 0.56 / Math.tan(Math.min(hFov, vFov * 1.05) / 2);
    this.fitDistance = Math.max(11.5, need);
    this.controls.minDistance = this.fitDistance * 0.55;
    this.controls.maxDistance = this.fitDistance * 1.6;
    this.scene.fog.near = this.fitDistance * 1.4;
    this.scene.fog.far = this.fitDistance * 3.2;
    this.camera.updateProjectionMatrix();
  }

  /** Puts the camera behind the given side. */
  setOrientation(color, animate = true) {
    this.orientation = color;
    const dir = color === 'w' ? 1 : -1;
    const d = this.fitDistance;
    const to = new THREE.Vector3(0, BOARD_TOP + d * 0.78, dir * d * 0.63);
    if (!animate) { this.camera.position.copy(to); this.camera.lookAt(this.controls.target); return; }
    const from = this.camera.position.clone();
    // Orbit around rather than through the board.
    const sFrom = new THREE.Spherical().setFromVector3(from.clone().sub(this.controls.target));
    const sTo = new THREE.Spherical().setFromVector3(to.clone().sub(this.controls.target));
    let dTheta = sTo.theta - sFrom.theta;
    if (dTheta > Math.PI) dTheta -= Math.PI * 2;
    if (dTheta < -Math.PI) dTheta += Math.PI * 2;
    this.tween(900, (k) => {
      const s = new THREE.Spherical(
        THREE.MathUtils.lerp(sFrom.radius, sTo.radius, k),
        THREE.MathUtils.lerp(sFrom.phi, sTo.phi, k),
        sFrom.theta + dTheta * k,
      );
      this.camera.position.setFromSpherical(s).add(this.controls.target);
    });
  }

  resetView() { this.setOrientation(this.orientation, true); }

  /** Rebuild every piece from a chess.js board() array. */
  setPosition(boardArray) {
    for (const g of this.pieces.values()) this.scene.remove(g);
    this.pieces.clear();
    boardArray.forEach((row) => row.forEach((p) => {
      if (!p) return;
      this.addPiece(p.type, p.color, p.square);
    }));
  }

  addPiece(type, color, sq) {
    const g = createPiece(type, color, this.mats);
    const p = squareToWorld(sq);
    g.position.copy(p);
    // Slight random twist makes the set feel hand-placed.
    if (type !== 'n') g.rotation.y = Math.random() * Math.PI * 2;
    g.userData.square = sq;
    this.scene.add(g);
    this.pieces.set(sq, g);
    return g;
  }

  /** Animate a chess.js verbose move. Resolves when the piece lands. */
  async animateMove(m) {
    const g = this.pieces.get(m.from);
    if (!g) return;
    const jobs = [];

    // Capture (including en passant)
    const capSq = m.flags.includes('e') ? m.to[0] + m.from[1] : m.to;
    const victim = m.captured ? this.pieces.get(capSq) : null;
    if (victim) this.pieces.delete(capSq);

    this.pieces.delete(m.from);
    this.pieces.set(m.to, g);
    g.userData.square = m.to;

    const from = g.position.clone();
    const to = squareToWorld(m.to);
    const dist = from.distanceTo(to);
    const lift = m.piece === 'n' ? 0.9 : 0.25 + dist * 0.04;
    const dur = 320 + dist * 45;
    jobs.push(this.tween(dur, (k) => {
      g.position.lerpVectors(from, to, k);
      g.position.y = BOARD_TOP + Math.sin(Math.PI * k) * lift;
    }));

    if (victim) {
      jobs.push(new Promise((res) => setTimeout(res, dur * 0.7)).then(() => this.removeCaptured(victim)));
    }

    // Castling: move the rook too.
    if (m.flags.includes('k') || m.flags.includes('q')) {
      const rank = m.from[1];
      const [rf, rt] = m.flags.includes('k') ? ['h' + rank, 'f' + rank] : ['a' + rank, 'd' + rank];
      const rook = this.pieces.get(rf);
      if (rook) {
        this.pieces.delete(rf);
        this.pieces.set(rt, rook);
        rook.userData.square = rt;
        const a = rook.position.clone(), b = squareToWorld(rt);
        jobs.push(this.tween(dur, (k) => {
          rook.position.lerpVectors(a, b, k);
          rook.position.y = BOARD_TOP + Math.sin(Math.PI * k) * 0.5;
        }, 120));
      }
    }

    await Promise.all(jobs);

    if (m.promotion) {
      this.scene.remove(g);
      this.pieces.delete(m.to);
      const q = this.addPiece(m.promotion, m.color, m.to);
      q.scale.setScalar(0.01);
      await this.tween(260, (k) => q.scale.setScalar(0.01 + k * 0.99));
    }
  }

  removeCaptured(victim) {
    const start = victim.position.clone();
    const color = victim.userData.color;
    // Captured pieces line up beside the board on their owner's side.
    this.captured ||= { w: 0, b: 0 };
    const i = this.captured[color]++;
    const side = color === 'w' ? 1 : -1;
    const dest = new THREE.Vector3(
      side * (BOARD_SIZE / 2 + 0.55 + Math.floor(i / 8) * 0.6),
      0,
      side * (3.5 - (i % 8)),
    );
    (this.graveyard ||= []).push(victim);
    return this.tween(520, (k) => {
      victim.position.lerpVectors(start, dest, k);
      victim.position.y = THREE.MathUtils.lerp(start.y, 0, k) + Math.sin(Math.PI * k) * 1.2;
      victim.scale.setScalar(1 - k * 0.25);
    });
  }

  clearCaptured() {
    this.captured = { w: 0, b: 0 };
  }

  /** Rebuild captured graveyards from lists of piece types. */
  setCaptured(list) {
    this.graveyard?.forEach((g) => this.scene.remove(g));
    this.graveyard = [];
    this.clearCaptured();
    for (const { type, color } of list) {
      const g = createPiece(type, color, this.mats);
      const i = this.captured[color]++;
      const side = color === 'w' ? 1 : -1;
      g.position.set(side * (BOARD_SIZE / 2 + 0.55 + Math.floor(i / 8) * 0.6), 0, side * (3.5 - (i % 8)));
      g.scale.setScalar(0.75);
      this.scene.add(g);
      this.graveyard.push(g);
    }
  }

  tween(ms, fn, delay = 0) {
    return new Promise((resolve) => {
      this.tweens.push({ start: performance.now() + delay, ms, fn, resolve });
    });
  }

  tick() {
    const now = performance.now();
    this.tweens = this.tweens.filter((t) => {
      if (now < t.start) return true;
      const k = Math.min(1, (now - t.start) / t.ms);
      t.fn(easeInOut(k));
      if (k >= 1) { t.resolve(); return false; }
      return true;
    });
    // Pulse the check glow.
    if (this.hlCheck.visible) this.hlCheck.material.opacity = 0.65 + Math.sin(now / 180) * 0.3;
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}
