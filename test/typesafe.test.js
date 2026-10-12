import { test } from 'node:test';
import assert from 'node:assert/strict';

// Mock the TypeSafe HTTP API so tests run without a key or network.
let lastRequest = null;
process.env.TYPESAFE_API_KEY = 'test-key';
globalThis.fetch = async (url, init) => {
  lastRequest = { url: String(url), init, body: JSON.parse(init.body) };
  const labels = Object.keys(lastRequest.body.questions.move.criteria);
  const probabilities = Object.fromEntries(labels.map((l) => [l, l === 'e2e4' ? 0.6 : 0.4 / (labels.length - 1)]));
  return new Response(JSON.stringify({
    model: 'jev-1.13.0',
    answers: {
      move: { type: 'choice', choice: 'e2e4', confidence: 0.72, probabilities },
      assessment: { type: 'score', score: 2.1, confidence: 0.5, legend: {}, probabilities: { 0: 0, 1: 0.1, 2: 0.7, 3: 0.2, 4: 0 } },
    },
    usage: { input_tokens: 900, output_tokens: 0 },
  }), { status: 200, headers: { 'content-type': 'application/json' } });
};

const { handle } = await import('../server/typesafe-jev.js');

test('GET reports whether a key is configured', async () => {
  const r = await handle('GET');
  assert.deepEqual(r.json, { enabled: true });
});

test('POST sends every legal move as a typed choice and returns them ranked', async () => {
  const r = await handle('POST', { fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', history: [] });
  assert.equal(r.status, 200);
  assert.match(lastRequest.url, /\/v1\/systemone$/);
  assert.equal(lastRequest.init.headers.authorization ?? lastRequest.init.headers.Authorization, 'Bearer test-key');
  const q = lastRequest.body.questions;
  assert.equal(q.move.type, 'choice');
  assert.equal(Object.keys(q.move.criteria).length, 20);
  assert.equal(q.assessment.type, 'score');
  assert.equal(r.json.ranked[0].uci, 'e2e4');
  assert.equal(r.json.ranked[0].san, 'e4');
  assert.equal(r.json.ranked.length, 20);
});

test('POST rejects bad input without calling the API', async () => {
  lastRequest = null;
  assert.equal((await handle('POST', { fen: 'nonsense' })).status, 400);
  assert.equal((await handle('POST', null)).status, 400);
  assert.equal(lastRequest, null);
});

// Move choice (priors + look-ahead) is covered in lookahead.test.js and engine-edge.test.js.
