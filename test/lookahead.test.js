// Jev must look at the opponent's replies before moving. User feedback:
// "it's deciding its move without considering what my next move would likely be".
// Each trap's bait is verified (by a deep reference search) to lose at least a piece
// or allow mate; Jev must avoid it at every level even when TypeSafe ranks it first.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Jev } from '../src/jev/engine.js';
import { Board, toUci } from '../src/jev/board.js';

const jev = new Jev();
const judge = new Jev();
const LEVELS = ['beginner', 'pro', 'legendary'];
const RUNS = { beginner: 12, pro: 4, legendary: 1 }; // beginner is random, so sample it more
const MAX_LOSS = { beginner: 200, pro: 100, legendary: 50 };

// Deep reference scores (centipawns, side to move) for every legal move.
function referenceScores(fen) {
  const bd = new Board(fen);
  judge.bd = bd;
  const root = judge.analyse(bd, { depth: 5, timeMs: 2500 }, [], 1e9);
  return Object.fromEntries(root.map((r) => { const u = toUci(r.m); return [u.from + u.to + (u.promotion || ''), r.score]; }));
}
const uci = (m) => m.from + m.to + (m.promotion || '');

const TRAPS = [
  { name: 'queen grabs a pawn the king defends (Qxd2+?? Kxd2)', fen: '4k3/8/8/3q4/8/2P5/3P4/4K3 b - - 0 1', bait: 'd5d2', reply: 'Kxd2' },
  { name: 'rook leaves the back rank (…Rc2?? Re8#)', fen: '2r3k1/5ppp/8/8/8/8/5PPP/4R1K1 b - - 0 1', bait: 'c8c2', reply: 'Re8#' },
  { name: 'bishop dropped on a6 (Ba6?? bxa6)', fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3', bait: 'f1a6' },
  { name: 'queen walks into a knight (Qh5?? Nxh5)', fen: 'rnbqkb1r/pppp1ppp/5n2/4p3/4P3/2N5/PPPP1PPP/R1BQKBNR w KQkq - 2 3', bait: 'd1h5', reply: 'Nxh5' },
];

for (const trap of TRAPS) {
  const ref = referenceScores(trap.fen);
  const best = Math.max(...Object.values(ref));

  test(`the bait really is a blunder: ${trap.name}`, () => {
    assert.ok(best - ref[trap.bait] >= 300, `bait loses only ${best - ref[trap.bait]} cp`);
  });

  for (const level of LEVELS) {
    test(`${level}: avoids "${trap.name}" even when TypeSafe ranks it first`, () => {
      for (let i = 0; i < RUNS[level]; i++) {
        const r = jev.think(trap.fen, ['-'], level, [], { [trap.bait]: 0.95 });
        assert.notEqual(uci(r.move), trap.bait, `${level} played the bait ${r.san}`);
        const loss = best - ref[uci(r.move)];
        assert.ok(loss <= MAX_LOSS[level], `${level} played ${r.san}, losing ${loss} cp`);
      }
    });
  }

  if (trap.reply) {
    test(`explains the refutation: ${trap.name}`, () => {
      const r = jev.think(trap.fen, ['-'], 'pro', [], { [trap.bait]: 0.95 });
      assert.equal(r.rejected?.reply, trap.reply);
      assert.ok(r.thought.startsWith(`Not ${r.rejected.san} — you'd answer ${trap.reply}.`), r.thought);
    });
  }
}

test('without TypeSafe priors, every level still avoids the traps', () => {
  for (const trap of TRAPS) {
    for (const level of LEVELS) {
      for (let i = 0; i < RUNS[level]; i++) assert.notEqual(uci(jev.think(trap.fen, ['-'], level).move), trap.bait, `${level}: ${trap.name}`);
    }
  }
});

test('commentary names the reply Jev is expecting', () => {
  const r = jev.think('rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2', ['-'], 'pro', [], { b8c6: 0.5 });
  assert.ok(r.reply, 'has an expected reply');
  assert.ok(r.thought.endsWith(`Expecting ${r.reply}.`), r.thought);
});

test('Beginner no longer plays random moves', () => {
  // The old Beginner played a completely random legal move 25% of the time.
  const fen = '4k3/8/8/3q4/8/2P5/3P4/4K3 b - - 0 1';
  const ref = referenceScores(fen);
  const best = Math.max(...Object.values(ref));
  for (let i = 0; i < 60; i++) {
    const r = jev.think(fen, ['-'], 'beginner');
    assert.ok(best - ref[uci(r.move)] <= MAX_LOSS.beginner, `beginner played ${r.san}`);
  }
});
