// Edge cases for the persisted You-vs-Jev scoreboard.
import { test } from 'node:test';
import assert from 'node:assert/strict';

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
  };
}
const load = () => import(`../src/ui/score.js?t=${Math.random()}`).then((m) => m.scoreboard);

test('starts at zero with empty storage', async () => {
  globalThis.localStorage = memoryStorage();
  assert.deepEqual((await load()).get(), { player: 0, jev: 0, draws: 0, games: [] });
});

test('records wins, losses and draws and persists them', async () => {
  globalThis.localStorage = memoryStorage();
  const sb = await load();
  sb.record('player', { level: 'pro' });
  sb.record('jev', { level: 'legendary' });
  sb.record('draw', {});
  sb.record('anything-else', {}); // unknown results count as draws
  assert.deepEqual({ ...sb.get(), games: undefined }, { player: 1, jev: 1, draws: 2, games: undefined });
  const reloaded = await load();
  assert.equal(reloaded.get().player, 1);
  assert.equal(reloaded.get().games[0].winner, 'anything-else', 'newest game first');
});

test('keeps only the 50 most recent games in history', async () => {
  globalThis.localStorage = memoryStorage();
  const sb = await load();
  for (let i = 0; i < 60; i++) sb.record('player', { n: i });
  assert.equal(sb.get().player, 60);
  assert.equal(sb.get().games.length, 50);
  assert.equal(sb.get().games[0].n, 59);
});

test('recovers from corrupted or partial stored data', async () => {
  globalThis.localStorage = memoryStorage({ 'jevchess.score': '{not json' });
  assert.deepEqual((await load()).get(), { player: 0, jev: 0, draws: 0, games: [] });

  globalThis.localStorage = memoryStorage({ 'jevchess.score': '{"player":3}' });
  const sb = await load();
  assert.deepEqual({ ...sb.get(), games: [] }, { player: 3, jev: 0, draws: 0, games: [] });
  sb.record('jev', {});
  assert.equal(sb.get().jev, 1);
});

test('works when storage is unavailable (private mode)', async () => {
  globalThis.localStorage = {
    getItem() { throw new Error('SecurityError'); },
    setItem() { throw new Error('QuotaExceededError'); },
    removeItem() { throw new Error('SecurityError'); },
  };
  const sb = await load();
  assert.equal(sb.record('player', {}).player, 1);
  assert.deepEqual(sb.reset(), { player: 0, jev: 0, draws: 0, games: [] });
});

test('reset clears storage and does not share state with the default object', async () => {
  globalThis.localStorage = memoryStorage();
  const sb = await load();
  sb.record('player', {});
  sb.reset();
  assert.equal(globalThis.localStorage.getItem('jevchess.score'), null);
  sb.record('jev', {});
  sb.reset();
  assert.deepEqual(sb.get(), { player: 0, jev: 0, draws: 0, games: [] });
});
