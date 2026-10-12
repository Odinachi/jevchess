// Lightweight canvas confetti burst — no dependencies.
const COLORS = ['#f6c945', '#ff6b6b', '#4dd4ac', '#5aa7ff', '#c78bff', '#ffffff', '#ff9f43'];

export function confetti(durationMs = 4200) {
  const canvas = document.createElement('canvas');
  canvas.className = 'confetti';
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(devicePixelRatio, 2);
  const resize = () => {
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
  };
  resize();

  const W = () => canvas.width, H = () => canvas.height;
  const parts = [];
  const burst = (x, y, n, spread) => {
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * spread;
      const v = (8 + Math.random() * 12) * dpr;
      parts.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        w: (6 + Math.random() * 6) * dpr, h: (8 + Math.random() * 10) * dpr,
        rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3,
        tilt: Math.random() * Math.PI, vt: 0.05 + Math.random() * 0.1,
        color: COLORS[(Math.random() * COLORS.length) | 0],
      });
    }
  };
  burst(W() * 0.15, H(), 140, 1.2);
  burst(W() * 0.85, H(), 140, 1.2);
  setTimeout(() => burst(W() / 2, H() * 0.6, 160, Math.PI * 1.4), 250);

  const start = performance.now();
  return new Promise((resolve) => {
    const frame = (now) => {
      const t = now - start;
      ctx.clearRect(0, 0, W(), H());
      for (const p of parts) {
        p.vy += 0.32 * dpr;
        p.vx *= 0.985; p.vy *= 0.985;
        p.x += p.vx + Math.sin(p.tilt) * dpr;
        p.y += p.vy;
        p.rot += p.vr; p.tilt += p.vt;
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - Math.max(0, t - durationMs + 900) / 900);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.scale(1, Math.cos(p.tilt));
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      if (t < durationMs) requestAnimationFrame(frame);
      else { canvas.remove(); resolve(); }
    };
    requestAnimationFrame(frame);
  });
}
