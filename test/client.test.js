// Edge cases for the browser-side TypeSafe client and the difficulty policy.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toPriors } from '../src/jev/typesafe.js';

const mv = (uci, p, san = uci) => ({ uci, san, from: uci.slice(0, 2), to: uci.slice(2, 4), p });
const fresh = () => import(`../src/jev/typesafe.js?t=${Math.random()}`); // new module = empty cache

// ---------- toPriors ----------

test('turns Jev\u2019s ranking into a uci → probability map', () => {
  assert.deepEqual(toPriors([mv('e2e4', 0.6), mv('d2d4', 0.3), mv('g1f3', 0.1)]), { e2e4: 0.6, d2d4: 0.3, g1f3: 0.1 });
});

test('bad probabilities count as zero and malformed entries are skipped', () => {
  const priors = toPriors([mv('a1a2', NaN), mv('b1b2', -0.5), { ...mv('c1c2', 0), p: undefined }, { uci: 'd1d2', p: '0.25' }, null, { p: 0.9 }]);
  assert.deepEqual(priors, { a1a2: 0, b1b2: 0, c1c2: 0, d1d2: 0.25 });
});

test('empty or missing rankings give empty priors', () => {
  assert.deepEqual(toPriors([]), {});
  assert.deepEqual(toPriors(undefined), {});
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
