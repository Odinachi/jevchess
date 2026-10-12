// Edge cases for the browser-side TypeSafe client and the difficulty policy.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyPolicy, typesafeThought } from '../src/jev/typesafe.js';

const mv = (uci, p, san = uci) => ({ uci, san, from: uci.slice(0, 2), to: uci.slice(2, 4), p });
const fresh = () => import(`../src/jev/typesafe.js?t=${Math.random()}`); // new module = empty cache

// ---------- applyPolicy ----------

test('every level handles a single legal move', () => {
  const only = [mv('e8d8', 1, 'Kd8')];
  for (const level of ['beginner', 'pro', 'legendary']) assert.equal(applyPolicy(only, level).pick.uci, 'e8d8');
  assert.deepEqual(applyPolicy(only, 'legendary').candidates, ['e8d8']);
});

test('unknown level falls back to Jev’s top choice', () => {
  assert.equal(applyPolicy([mv('a', 0.9), mv('b', 0.1)], 'grandmaster').pick.uci, 'a');
});

test('beginner never picks outside Jev’s top 8', () => {
  const ranked = Array.from({ length: 30 }, (_, i) => mv(`m${i}`, (30 - i) / 465));
  const top8 = new Set(ranked.slice(0, 8).map((m) => m.uci));
  for (let i = 0; i < 500; i++) assert.ok(top8.has(applyPolicy(ranked, 'beginner').pick.uci));
});

test('beginner is deterministic at the random extremes', () => {
  const ranked = [mv('a', 0.7), mv('b', 0.2), mv('c', 0.1)];
  assert.equal(applyPolicy(ranked, 'beginner', () => 0).pick.uci, 'a');
  assert.equal(applyPolicy(ranked, 'beginner', () => 0.999999).pick.uci, 'c');
});

test('beginner copes with zero and missing probabilities', () => {
  const ranked = [mv('a', 0), mv('b', 0), { ...mv('c', 0), p: undefined }];
  // All weights equal, so the middle of the range must land on the middle move.
  assert.equal(applyPolicy(ranked, 'beginner', () => 0.5).pick.uci, 'b');
});

test('beginner still favours Jev’s preferred move overall', () => {
  const ranked = [mv('a', 0.9), mv('b', 0.05), mv('c', 0.05)];
  let a = 0;
  for (let i = 0; i < 2000; i++) if (applyPolicy(ranked, 'beginner').pick.uci === 'a') a++;
  assert.ok(a > 2000 / 3, `top move picked ${a}/2000`);
  assert.ok(a < 1950, 'but not always (flattened)');
});

test('legendary caps the shortlist at 6 for a flat distribution', () => {
  const ranked = Array.from({ length: 40 }, (_, i) => mv(`m${i}`, 1 / 40));
  assert.equal(applyPolicy(ranked, 'legendary').candidates.length, 6);
});

test('legendary takes at least 3 even when Jev is very confident', () => {
  const ranked = [mv('a', 0.98), mv('b', 0.01), mv('c', 0.005), mv('d', 0.005)];
  assert.deepEqual(applyPolicy(ranked, 'legendary').candidates, ['a', 'b', 'c']);
});

test('legendary appends every mating move, even low-ranked ones', () => {
  const ranked = [
    ...Array.from({ length: 10 }, (_, i) => mv(`m${i}`, 0.099)),
    mv('h5f7', 0.005, 'Qxf7#'),
    mv('d1d8', 0.005, 'Rd8#'),
  ];
  const { candidates } = applyPolicy(ranked, 'legendary');
  assert.ok(candidates.includes('h5f7') && candidates.includes('d1d8'));
  assert.equal(new Set(candidates).size, candidates.length, 'no duplicates');
});

// ---------- typesafeThought ----------

test('thought text handles mate, missing fields and out-of-range scores', () => {
  assert.equal(typesafeThought({ san: 'Qxf7#' }, { confidence: 0.2, assessment: 0 }), 'Checkmate.');
  assert.equal(typesafeThought({ san: 'e4' }, {}), 'e4. Balanced game.');
  assert.match(typesafeThought({ san: 'e4' }, { assessment: 99, confidence: 0.876 }), /going my way\. \(88% sure\)$/);
  assert.match(typesafeThought({ san: 'e4' }, { assessment: -5 }), /in trouble/);
  assert.match(typesafeThought({ san: 'e4' }, { assessment: 2.6 }), /I like my position/);
});

// ---------- network client ----------

test('typesafeEnabled caches the answer and survives network errors', async () => {
  let hits = 0;
  globalThis.fetch = async () => { hits++; throw new TypeError('offline'); };
  const { typesafeEnabled } = await fresh();
  assert.equal(await typesafeEnabled(), false);
  assert.equal(await typesafeEnabled(), false);
  assert.equal(hits, 1);
});

test('typesafeEnabled is false on non-OK or malformed responses', async () => {
  globalThis.fetch = async () => new Response('server error', { status: 500 });
  assert.equal(await (await fresh()).typesafeEnabled(), false);
  globalThis.fetch = async () => new Response('{"enabled":"yes"}');
  assert.equal(await (await fresh()).typesafeEnabled(), true);
  globalThis.fetch = async () => new Response('{}');
  assert.equal(await (await fresh()).typesafeEnabled(), false);
});

test('askTypeSafeJev posts the position as JSON', async () => {
  let req;
  globalThis.fetch = async (url, init) => {
    req = { url, init };
    return Response.json({ ranked: [mv('e2e4', 1, 'e4')], confidence: 1 });
  };
  const { askTypeSafeJev } = await fresh();
  const data = await askTypeSafeJev('fen-here', ['e4']);
  assert.equal(req.url, '/api/jev');
  assert.equal(req.init.method, 'POST');
  assert.deepEqual(JSON.parse(req.init.body), { fen: 'fen-here', history: ['e4'] });
  assert.equal(data.ranked[0].san, 'e4');
});

test('askTypeSafeJev rejects HTTP errors and empty rankings', async () => {
  const { askTypeSafeJev } = await fresh();
  globalThis.fetch = async () => Response.json({ error: 'x' }, { status: 502 });
  await assert.rejects(askTypeSafeJev('f', []), /HTTP 502/);
  globalThis.fetch = async () => Response.json({ ranked: [] });
  await assert.rejects(askTypeSafeJev('f', []), /no moves/);
  globalThis.fetch = async () => Response.json({});
  await assert.rejects(askTypeSafeJev('f', []), /no moves/);
});

test('askTypeSafeJev times out instead of hanging the game', async () => {
  globalThis.fetch = (url, init) => new Promise((_, reject) => {
    init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
  });
  const { askTypeSafeJev } = await fresh();
  const t0 = Date.now();
  await assert.rejects(askTypeSafeJev('f', [], { timeoutMs: 50 }), /abort/i);
  assert.ok(Date.now() - t0 < 1000);
});
