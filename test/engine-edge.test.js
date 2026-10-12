// Edge cases for the local engine (offline fallback and Legendary verifier).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { Board, sqIndex, sqName, toUci } from '../src/jev/board.js';
import { Jev } from '../src/jev/engine.js';

const jev = new Jev();
const LEVELS = ['beginner', 'pro', 'legendary'];
const legalIn = (fen, move) => new Chess(fen).moves({ verbose: true })
  .some((m) => m.from === move.from && m.to === move.to && (m.promotion || undefined) === (move.promotion || undefined));

// ---------- board primitives ----------

test('square names round-trip on the 0x88 board', () => {
  for (const f of 'abcdefgh') for (let r = 1; r <= 8; r++) assert.equal(sqName(sqIndex(f + r)), f + r);
});

test('every generated move round-trips through make/unmake and Zobrist', () => {
  const fens = [
    'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1',
    '4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 2',
    '4k3/1P6/8/8/8/8/6p1/4K3 b - - 0 1',
  ];
  for (const fen of fens) {
    const b = new Board(fen);
    const snapshot = b.b.slice();
    for (const m of b.gen()) {
      if (!b.make(m)) continue;
      assert.equal(b.hash, b.computeHash(), `hash after ${JSON.stringify(toUci(m))}`);
      b.unmake();
      assert.deepEqual(b.b, snapshot);
    }
  }
});

test('castling rights are lost when the rook is captured', () => {
  const b = new Board('r3k2r/8/8/8/8/8/6B1/R3K2R w KQkq - 0 1');
  const m = b.gen().find((x) => sqName(x & 127) === 'g2' && sqName((x >> 7) & 127) === 'a8');
  assert.ok(b.make(m));
  assert.equal(b.castle & 8, 0, 'black queenside right gone');
  assert.equal(b.castle & 4, 4, 'black kingside right kept');
});

test('cannot castle through or out of check', () => {
  const through = new Board('4k3/8/8/8/8/8/5r2/R3K2R w KQ - 0 1'); // rook on f2 covers f1
  const outOf = new Board('4k3/8/8/8/8/8/4r3/R3K2R w KQ - 0 1');
  const castles = (b) => b.gen().filter((m) => (m >> 17) & 4).map((m) => sqName((m >> 7) & 127));
  assert.deepEqual(castles(through), ['c1']);
  assert.deepEqual(castles(outOf), []);
});

test('en passant that would expose the king is illegal', () => {
  // White king a5, black rook h5: exd6 e.p. would clear the rank.
  const fen = '4k3/8/8/K2pP2r/8/8/8/8 w - d6 0 2';
  const b = new Board(fen);
  const ep = b.gen().find((m) => (m >> 17) & 2);
  assert.ok(ep, 'pseudo-legal e.p. generated');
  assert.equal(b.make(ep), false, 'rejected as illegal');
  assert.equal(new Chess(fen).moves().includes('exd6'), false);
});

// ---------- engine decisions ----------

test('returns null for checkmated and stalemated positions', () => {
  for (const fen of ['rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3', 'k7/2Q5/1K6/8/8/8/8/8 b - - 0 1']) {
    for (const level of LEVELS) assert.equal(jev.think(fen, [], level), null);
  }
});

test('plays the only legal move', () => {
  const fen = 'k7/8/2K5/8/8/8/8/1R6 b - - 0 1'; // b8 covered by the rook, b7 by the king
  assert.deepEqual(new Chess(fen).moves(), ['Ka7']);
  for (const level of LEVELS) assert.equal(jev.think(fen, [], level).san, 'Ka7');
});

test('mates instead of stalemating in K+Q vs K', () => {
  // Qc7?? is stalemate; Qc8# is mate.
  const fen = 'k7/8/1K6/8/8/8/8/2Q5 w - - 0 1';
  for (const level of ['pro', 'legendary']) assert.equal(jev.think(fen, ['-'], level).san, 'Qc8#');
});

test('finds mate as black, too', () => {
  const fen = '3r2k1/8/8/8/8/8/5PPP/6K1 b - - 0 1';
  for (const level of ['pro', 'legendary']) assert.equal(jev.think(fen, ['-'], level).san, 'Rd1#');
});

test('promotes to a queen when it wins', () => {
  for (const level of ['pro', 'legendary']) assert.equal(jev.think('8/1P6/8/8/8/8/k7/4K3 w - - 0 1', ['-'], level).move.promotion, 'q');
});

test('escapes check with a legal move at every level', () => {
  const fen = '4k3/8/8/8/8/8/3q4/4K3 w - - 0 1';
  for (const level of LEVELS) for (let i = 0; i < 5; i++) assert.ok(legalIn(fen, jev.think(fen, [], level).move));
});

test('random play at every level only ever produces legal moves', () => {
  for (const level of LEVELS) {
    const g = new Chess();
    while (!g.isGameOver() && g.history().length < 40) {
      const r = jev.think(g.fen(), g.history(), level);
      assert.ok(legalIn(g.fen(), r.move), `${level}: ${JSON.stringify(r.move)} in ${g.fen()}`);
      g.move(r.move);
    }
  }
});

test('a losing side heads for a repetition draw', () => {
  // Black is a queen down. If Kh8 recreates an earlier position, Jev should take the draw.
  const fen = '6k1/8/8/8/8/8/5QPP/6K1 b - - 0 1';
  const plain = jev.think(fen, ['-'], 'legendary');
  assert.ok(plain.score < -500, 'clearly lost without repetition');
  const afterKh8 = new Chess(fen); afterKh8.move('Kh8');
  const r = jev.think(fen, ['-'], 'legendary', [afterKh8.fen()]);
  assert.equal(r.san, 'Kh8');
  assert.equal(r.score, 0);
});

// ---------- candidate restriction (Legendary verification of TypeSafe's shortlist) ----------

test('candidate search only plays from the shortlist', () => {
  const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  for (let i = 0; i < 3; i++) {
    const r = jev.think(fen, [], 'legendary', [], ['a2a3', 'h2h3']);
    assert.ok(['a2a3', 'h2h3'].includes(r.move.from + r.move.to));
    assert.equal(r.book, false, 'book disabled when verifying');
  }
});

test('candidate search picks the mate from the shortlist', () => {
  const fen = '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1';
  assert.equal(jev.think(fen, ['-'], 'legendary', [], ['g1f1', 'd1d8', 'h2h3']).san, 'Rd8#');
});

test('candidate search rejects a blunder in the shortlist', () => {
  const fen = 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 2 3';
  assert.equal(jev.think(fen, ['-'], 'legendary', [], ['f3f7', 'f3g4']).san, 'Qxf7#');
});

test('illegal or unknown candidates fall back to the full move list', () => {
  const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const r = jev.think(fen, [], 'legendary', [], ['e2e5', 'z9z9']);
  assert.ok(legalIn(fen, r.move));
});

test('a promotion candidate keeps its piece suffix', () => {
  const fen = '8/1P6/8/8/8/8/k7/4K3 w - - 0 1';
  const r = jev.think(fen, ['-'], 'legendary', [], ['b7b8n']);
  assert.deepEqual([r.move.from, r.move.to, r.move.promotion], ['b7', 'b8', 'n']);
});
