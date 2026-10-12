// Synthesised wooden "clack" sounds via WebAudio — no audio files needed.
let ac;
let muted = false;
try { muted = localStorage.getItem('jevchess.muted') === '1'; } catch {}

function ctx() {
  if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
  if (ac.state === 'suspended') ac.resume();
  return ac;
}

function knock(freq = 900, gain = 0.6, decay = 0.07) {
  if (muted) return;
  const a = ctx();
  const t = a.currentTime;
  const len = Math.floor(a.sampleRate * 0.12);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (a.sampleRate * decay * 0.3));
  const src = a.createBufferSource();
  src.buffer = buf;
  const bp = a.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = freq;
  bp.Q.value = 3;
  const body = a.createOscillator();
  body.frequency.setValueAtTime(freq / 4, t);
  body.frequency.exponentialRampToValueAtTime(freq / 8, t + decay);
  const bg = a.createGain();
  bg.gain.setValueAtTime(gain * 0.5, t);
  bg.gain.exponentialRampToValueAtTime(0.001, t + decay * 1.5);
  const g = a.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + decay * 2);
  src.connect(bp).connect(g).connect(a.destination);
  body.connect(bg).connect(a.destination);
  src.start(t); body.start(t); body.stop(t + 0.2);
}

export const sound = {
  move: () => knock(1100, 0.5, 0.06),
  capture: () => { knock(700, 0.8, 0.09); setTimeout(() => knock(1300, 0.3, 0.05), 40); },
  check: () => { knock(1500, 0.6, 0.06); setTimeout(() => knock(1500, 0.4, 0.06), 110); },
  end: () => [0, 140, 280].forEach((d, i) => setTimeout(() => knock(600 + i * 300, 0.6, 0.12), d)),
  unlock: () => { try { ctx(); } catch {} },
  get muted() { return muted; },
  toggle() {
    muted = !muted;
    try { localStorage.setItem('jevchess.muted', muted ? '1' : '0'); } catch {}
    return muted;
  },
};
