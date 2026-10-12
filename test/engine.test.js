// Run with: npm test  (uses Node's built-in test runner)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Board } from '../src/jev/board.js';
import { Jev } from '../src/jev/engine.js';

function perft(b, d) {
  if (!d) return 1;
  let n = 0;
  for (const m of b.gen()) if (b.make(m)) { n += perft(b, d - 1); b.unmake(); }
  return n;
}

const PERFT = [
  ['rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 4, 197281],
  ['r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', 3, 97862],
  ['8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', 5, 674624],
  ['r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', 4, 422333],
  ['rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', 3, 62379],
];

for (const [fen, depth, expected] of PERFT) {
  test(`perft ${depth}: ${fen}`, () => {
    const b = new Board(fen);
    const before = b.hash;
    assert.equal(perft(b, depth), expected);
    assert.equal(b.hash, before, 'hash restored after unmake');
  });
}

const jev = new Jev();
const MATES = [
  ['r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 2 3', 'Qxf7#'],
  ['6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1', 'Rd8#'],
  ['r2qkb1r/pp2nppp/3p4/2pNN1B1/2BnP3/3P4/PPP2PPP/R2bK2R w KQkq - 1 1', 'Nf6+'],
];
for (const level of ['pro', 'legendary']) {
  for (const [fen, san] of MATES) {
    test(`${level} finds ${san}`, () => {
      assert.equal(jev.think(fen, ['-'], level).san, san);
    });
  }
}

test('returns null when there are no legal moves', () => {
  assert.equal(jev.think('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1', [], 'pro'), null);
});
