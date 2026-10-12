// Edge cases for the server-side TypeSafe Jev bridge, with the HTTP API mocked.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.TYPESAFE_API_KEY = 'test-key';

let calls = [];
let responder;
const ok = (answers) => new Response(JSON.stringify({ model: 'jev-test', answers, usage: { input_tokens: 1, output_tokens: 0 } }), {
  status: 200, headers: { 'content-type': 'application/json' },
});
const uniform = (body, overrides = {}) => {
  const labels = Object.keys(body.questions.move.criteria);
  return Object.fromEntries(labels.map((l) => [l, overrides[l] ?? 1 / labels.length]));
};
const defaultResponder = (body) => ok({
  move: { type: 'choice', choice: Object.keys(body.questions.move.criteria)[0], confidence: 0.5, probabilities: uniform(body) },
  assessment: { type: 'score', score: 2, confidence: 0.5, legend: {}, probabilities: {} },
});

globalThis.fetch = async (url, init) => {
  const body = JSON.parse(init.body);
  calls.push({ url: String(url), init, body });
  return responder(body);
};

const { handle } = await import('../server/typesafe-jev.js');

beforeEach(() => { calls = []; responder = defaultResponder; });

const post = (body, ip = 'test') => handle('POST', body, ip);
const criteriaOf = () => calls.at(-1).body.questions.move.criteria;

// ---------- configuration & method handling ----------

test('reports disabled and returns 503 when no key is configured', async () => {
  const saved = process.env.TYPESAFE_API_KEY;
  delete process.env.TYPESAFE_API_KEY;
  try {
    assert.deepEqual((await handle('GET')).json, { enabled: false });
    const r = await post({ fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' });
    assert.equal(r.status, 503);
    assert.equal(calls.length, 0);
  } finally {
    process.env.TYPESAFE_API_KEY = saved;
  }
});

test('rejects unsupported HTTP methods', async () => {
  for (const m of ['PUT', 'DELETE', 'PATCH']) assert.equal((await handle(m, {})).status, 405);
});

// ---------- input validation (never reaches the API) ----------

const BAD_BODIES = [
  ['null body', null],
  ['missing fen', {}],
  ['numeric fen', { fen: 42 }],
  ['garbage fen', { fen: 'not a fen' }],
  ['overlong fen', { fen: 'r'.repeat(500) }],
  ['two white kings', { fen: 'k7/8/8/8/8/8/8/KK6 w - - 0 1' }],
];
for (const [name, body] of BAD_BODIES) {
  test(`400 for ${name}`, async () => {
    assert.equal((await post(body)).status, 400);
    assert.equal(calls.length, 0);
  });
}

test('400 when the side to move is checkmated', async () => {
  // Fool's mate: white is mated.
  const r = await post({ fen: 'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3' });
  assert.equal(r.status, 400);
  assert.equal(calls.length, 0);
});

test('400 when the side to move is stalemated', async () => {
  assert.equal((await post({ fen: 'k7/2Q5/1K6/8/8/8/8/8 b - - 0 1' })).status, 400);
  assert.equal(calls.length, 0);
});

// ---------- request shape ----------

test('only legal check evasions are offered when in check', async () => {
  // Rook on e1 checks the king on e8; staying on the e-file (e7) is illegal.
  await post({ fen: '4k3/8/8/8/8/8/8/4R1K1 b - - 0 1' });
  const labels = Object.keys(criteriaOf()).sort();
  assert.deepEqual(labels, ['e8d7', 'e8d8', 'e8f7', 'e8f8']);
  assert.equal(calls.at(-1).body.state.in_check, true);
});

test('describes castling, en passant, promotion, check and mate', async () => {
  await post({ fen: 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1' });
  assert.match(criteriaOf().e1g1, /castles kingside/);
  assert.match(criteriaOf().e1c1, /castles queenside/);

  await post({ fen: '4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 2' });
  assert.match(criteriaOf().e5d6, /captures pawn en passant/);

  await post({ fen: '4k3/1P6/8/8/8/8/8/4K3 w - - 0 1' });
  for (const p of ['q', 'r', 'b', 'n']) assert.ok(criteriaOf()[`b7b8${p}`], `underpromotion b7b8${p} offered`);
  assert.match(criteriaOf().b7b8q, /promotes to queen, gives check/);

  await post({ fen: '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1' });
  assert.match(criteriaOf().d1d8, /checkmate/);
});

test('handles the maximum-mobility position (218 moves, under the 255 option cap)', async () => {
  const r = await post({ fen: 'R6R/3Q4/1Q4Q1/4Q3/2Q4Q/Q4Q2/pp1Q4/kBNN1KB1 w - - 0 1' });
  assert.equal(r.status, 200);
  assert.equal(Object.keys(criteriaOf()).length, 218);
  assert.equal(r.json.ranked.length, 218);
});

test('sanitises history: drops non-strings, keeps only recent moves in state', async () => {
  const history = [1, null, { x: 1 }, ...Array.from({ length: 300 }, (_, i) => `m${i}`)];
  await post({ fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', history });
  const recent = calls.at(-1).body.state.recent_moves.split(' ');
  assert.equal(recent.length, 16);
  assert.equal(recent.at(-1), 'm299');
});

test('empty history is described as the game start', async () => {
  await post({ fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', history: 'oops' });
  assert.equal(calls.at(-1).body.state.recent_moves, '(game start)');
});

test('asks from black’s perspective when black is to move', async () => {
  await post({ fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1' });
  const { questions, state } = calls.at(-1).body;
  assert.equal(state.side_to_move, 'Black');
  assert.match(JSON.stringify(questions.move.instructions), /playing Black/);
  assert.equal(questions.assessment.criteria.length, 5);
});

// ---------- response handling ----------

test('drops hallucinated labels and keeps the ranking sorted', async () => {
  responder = (body) => ok({
    move: { type: 'choice', choice: 'z9z9', confidence: 0.9, probabilities: { ...uniform(body, { g1f3: 0.5 }), z9z9: 0.99, e2e9: 0.2 } },
    assessment: { type: 'score', score: 2, confidence: 0.5, legend: {}, probabilities: {} },
  });
  const r = await post({ fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' });
  assert.equal(r.status, 200);
  assert.ok(r.json.ranked.every((m) => /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(m.uci) && m.uci !== 'e2e9'));
  assert.equal(r.json.ranked[0].uci, 'g1f3');
  for (let i = 1; i < r.json.ranked.length; i++) assert.ok(r.json.ranked[i - 1].p >= r.json.ranked[i].p);
});

test('502 when every returned label is illegal', async () => {
  responder = () => ok({
    move: { type: 'choice', choice: 'a1a1', confidence: 1, probabilities: { a1a1: 1 } },
    assessment: { type: 'score', score: 2, confidence: 0.5, legend: {}, probabilities: {} },
  });
  assert.equal((await post({ fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' })).status, 502);
});

test('a partial distribution only ranks the moves Jev returned', async () => {
  responder = () => ok({
    move: { type: 'choice', choice: 'e2e4', confidence: 0.8, probabilities: { e2e4: 0.7, d2d4: 0.3 } },
    assessment: { type: 'score', score: 2, confidence: 0.5, legend: {}, probabilities: {} },
  });
  const r = await post({ fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' });
  assert.deepEqual(r.json.ranked.map((m) => m.san), ['e4', 'd4']);
});

test('promotion moves carry the promotion piece back to the client', async () => {
  responder = () => ok({
    move: { type: 'choice', choice: 'b7b8n', confidence: 0.8, probabilities: { b7b8n: 0.9, b7b8q: 0.1 } },
    assessment: { type: 'score', score: 4, confidence: 0.5, legend: {}, probabilities: {} },
  });
  const r = await post({ fen: '4k3/1P6/8/8/8/8/8/4K3 w - - 0 1' });
  assert.deepEqual(r.json.ranked[0], { uci: 'b7b8n', san: 'b8=N', from: 'b7', to: 'b8', promotion: 'n', p: 0.9 });
});

for (const [status, retried] of [[401, false], [400, false], [500, true]]) {
  test(`maps an upstream ${status} to 502${retried ? ' after one retry' : ' without retrying'}`, async () => {
    const quiet = console.error;
    console.error = () => {};
    responder = () => new Response(JSON.stringify({ error: 'nope' }), { status, headers: { 'content-type': 'application/json' } });
    try {
      const r = await post({ fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' });
      assert.equal(r.status, 502);
      assert.equal(calls.length, retried ? 2 : 1);
      assert.doesNotMatch(JSON.stringify(r.json), /test-key/, 'never leaks the key');
    } finally {
      console.error = quiet;
    }
  });
}

test('maps a network failure to 502', async () => {
  const quiet = console.error;
  console.error = () => {};
  responder = () => { throw new TypeError('fetch failed'); };
  try {
    assert.equal((await post({ fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' })).status, 502);
  } finally {
    console.error = quiet;
  }
});

// ---------- rate limiting ----------

test('rate-limits a single IP without affecting others', async () => {
  const statuses = [];
  for (let i = 0; i < 95; i++) statuses.push((await post({ fen: 'bad' }, '10.0.0.1')).status);
  assert.equal(statuses.filter((s) => s === 429).length, 5);
  assert.equal(statuses[89], 400);
  assert.equal(statuses[90], 429);
  assert.equal((await post({ fen: 'bad' }, '10.0.0.2')).status, 400);
  assert.equal((await handle('GET', null, '10.0.0.1')).status, 200, 'GET is not rate-limited');
});
