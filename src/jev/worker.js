import { Jev } from './engine.js';

const jev = new Jev();

self.onmessage = ({ data }) => {
  const { id, fen, history, level, past, candidates } = data;
  const t0 = performance.now();
  const result = jev.think(fen, history, level, past, candidates);
  self.postMessage({ id, result, ms: Math.round(performance.now() - t0) });
};
