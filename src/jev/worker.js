import { Jev } from './engine.js';

const jev = new Jev();

self.onmessage = ({ data }) => {
  const { id, fen, history, level, past } = data;
  const t0 = performance.now();
  const result = jev.think(fen, history, level, past);
  self.postMessage({ id, result, ms: Math.round(performance.now() - t0) });
};
