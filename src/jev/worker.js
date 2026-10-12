import { Jev } from './engine.js';

const jev = new Jev();

self.onmessage = ({ data }) => {
  const { id, fen, history, level } = data;
  const t0 = performance.now();
  const result = jev.think(fen, history, level);
  self.postMessage({ id, result, ms: Math.round(performance.now() - t0) });
};
