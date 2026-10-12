// Jev — the decision model that plays the black (or white) pieces.
// It scores positions with material + piece-square tables + king safety,
// then picks a move with iterative-deepening alpha-beta search,
// quiescence on captures, MVV-LVA / killer move ordering and a small
// opening book. Lower levels add controlled randomness so Jev feels human.
import { Chess } from 'chess.js';

const VALUE = { p: 100, n: 320, b: 335, r: 500, q: 950, k: 0 };
const MATE = 100000;

// Piece-square tables from white's perspective, a8 = index 0.
const PST = {
  p: [
    0, 0, 0, 0, 0, 0, 0, 0,
    60, 60, 60, 60, 60, 60, 60, 60,
    15, 15, 22, 32, 32, 22, 15, 15,
    6, 6, 12, 26, 26, 12, 6, 6,
    0, 0, 6, 22, 22, 6, 0, 0,
    5, -4, -8, 2, 2, -8, -4, 5,
    5, 10, 10, -22, -22, 10, 10, 5,
    0, 0, 0, 0, 0, 0, 0, 0,
  ],
  n: [
    -50, -40, -30, -30, -30, -30, -40, -50,
    -40, -20, 0, 0, 0, 0, -20, -40,
    -30, 0, 10, 15, 15, 10, 0, -30,
    -30, 5, 15, 20, 20, 15, 5, -30,
    -30, 0, 15, 20, 20, 15, 0, -30,
    -30, 5, 10, 15, 15, 10, 5, -30,
    -40, -20, 0, 5, 5, 0, -20, -40,
    -50, -40, -30, -30, -30, -30, -40, -50,
  ],
  b: [
    -20, -10, -10, -10, -10, -10, -10, -20,
    -10, 0, 0, 0, 0, 0, 0, -10,
    -10, 0, 5, 10, 10, 5, 0, -10,
    -10, 5, 5, 10, 10, 5, 5, -10,
    -10, 0, 10, 10, 10, 10, 0, -10,
    -10, 10, 10, 10, 10, 10, 10, -10,
    -10, 5, 0, 0, 0, 0, 5, -10,
    -20, -10, -10, -10, -10, -10, -10, -20,
  ],
  r: [
    0, 0, 0, 0, 0, 0, 0, 0,
    5, 10, 10, 10, 10, 10, 10, 5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    0, 0, 0, 5, 5, 0, 0, 0,
  ],
  q: [
    -20, -10, -10, -5, -5, -10, -10, -20,
    -10, 0, 0, 0, 0, 0, 0, -10,
    -10, 0, 5, 5, 5, 5, 0, -10,
    -5, 0, 5, 5, 5, 5, 0, -5,
    0, 0, 5, 5, 5, 5, 0, -5,
    -10, 5, 5, 5, 5, 5, 0, -10,
    -10, 0, 5, 0, 0, 0, 0, -10,
    -20, -10, -10, -5, -5, -10, -10, -20,
  ],
  k: [
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -20, -30, -30, -40, -40, -30, -30, -20,
    -10, -20, -20, -20, -20, -20, -20, -10,
    20, 20, 0, 0, 0, 0, 20, 20,
    20, 30, 10, 0, 0, 10, 30, 20,
  ],
  kEnd: [
    -50, -40, -30, -20, -20, -30, -40, -50,
    -30, -20, -10, 0, 0, -10, -20, -30,
    -30, -10, 20, 30, 30, 20, -10, -30,
    -30, -10, 30, 40, 40, 30, -10, -30,
    -30, -10, 30, 40, 40, 30, -10, -30,
    -30, -10, 20, 30, 30, 20, -10, -30,
    -30, -30, 0, 0, 0, 0, -30, -30,
    -50, -30, -30, -30, -30, -30, -30, -50,
  ],
};

// Small opening repertoire keyed by space-joined SAN history.
const BOOK = {
  '': ['e4', 'd4', 'Nf3', 'c4'],
  e4: ['e5', 'c5', 'e6', 'c6'],
  d4: ['d5', 'Nf6'],
  Nf3: ['d5', 'Nf6'],
  c4: ['e5', 'Nf6', 'c5'],
  'e4 e5': ['Nf3'],
  'e4 e5 Nf3': ['Nc6'],
  'e4 e5 Nf3 Nc6': ['Bb5', 'Bc4', 'd4'],
  'e4 e5 Nf3 Nc6 Bb5': ['a6', 'Nf6'],
  'e4 e5 Nf3 Nc6 Bc4': ['Bc5', 'Nf6'],
  'e4 c5': ['Nf3', 'Nc3'],
  'e4 c5 Nf3': ['d6', 'Nc6', 'e6'],
  'e4 e6': ['d4'],
  'e4 e6 d4': ['d5'],
  'e4 c6': ['d4'],
  'e4 c6 d4': ['d5'],
  'd4 d5': ['c4', 'Nf3'],
  'd4 d5 c4': ['e6', 'c6', 'dxc4'],
  'd4 Nf6': ['c4', 'Nf3'],
  'd4 Nf6 c4': ['e6', 'g6'],
  'Nf3 d5': ['d4', 'g3'],
  'Nf3 Nf6': ['c4', 'g3'],
};

export const LEVELS = {
  1: { name: 'Rookie', depth: 1, timeMs: 250, noise: 120, blunder: 0.25 },
  2: { name: 'Casual', depth: 2, timeMs: 500, noise: 45, blunder: 0.08 },
  3: { name: 'Club', depth: 3, timeMs: 1200, noise: 12, blunder: 0 },
  4: { name: 'Master', depth: 5, timeMs: 2500, noise: 0, blunder: 0 },
};

function evaluate(chess) {
  const board = chess.board();
  let mg = 0;
  let nonPawn = 0;
  let wk = -1;
  let bk = -1;
  const wBishops = [];
  const bBishops = [];
  for (let r = 0; r < 8; r++) {
    const row = board[r];
    for (let f = 0; f < 8; f++) {
      const sq = row[f];
      if (!sq) continue;
      const white = sq.color === 'w';
      const idx = white ? r * 8 + f : (7 - r) * 8 + f;
      if (sq.type === 'k') {
        if (white) wk = idx; else bk = idx;
        continue;
      }
      if (sq.type !== 'p') nonPawn += VALUE[sq.type];
      if (sq.type === 'b') (white ? wBishops : bBishops).push(1);
      const s = VALUE[sq.type] + PST[sq.type][idx];
      mg += white ? s : -s;
    }
  }
  // Tapered king: middlegame table while material is high, endgame table later.
  const phase = Math.min(1, nonPawn / 6200);
  const kingScore = (i) => phase * PST.k[i] + (1 - phase) * PST.kEnd[i];
  mg += kingScore(wk) - kingScore(bk);
  if (wBishops.length >= 2) mg += 30;
  if (bBishops.length >= 2) mg -= 30;
  const score = chess.turn() === 'w' ? mg : -mg;
  return score;
}

function mvvLva(m) {
  let s = 0;
  if (m.captured) s += 10 * VALUE[m.captured] - VALUE[m.piece] + 10000;
  if (m.promotion) s += VALUE[m.promotion] + 9000;
  return s;
}

class TimeUp extends Error {}

export class Jev {
  constructor() {
    this.killers = [];
    this.history = new Map();
  }

  /**
   * @param {string} fen
   * @param {string[]} sanHistory
   * @param {number} level 1..4
   * @returns {{ move: {from:string,to:string,promotion?:string}, san:string, score:number, depth:number, nodes:number, book:boolean, thought:string }}
   */
  think(fen, sanHistory, level = 3) {
    const cfg = LEVELS[level] || LEVELS[3];
    const chess = new Chess(fen);
    const legal = chess.moves({ verbose: true });
    if (!legal.length) return null;

    const key = sanHistory.join(' ');
    const bookMoves = (BOOK[key] || []).filter((san) => legal.some((m) => m.san === san));
    if (bookMoves.length && sanHistory.length < 8) {
      const san = bookMoves[Math.floor(Math.random() * bookMoves.length)];
      const m = legal.find((x) => x.san === san);
      return { move: pick(m), san, score: 0, depth: 0, nodes: 0, book: true, thought: 'Book move — known theory.' };
    }

    // Rookie occasionally plays a plain random-but-legal move.
    if (Math.random() < cfg.blunder) {
      const m = legal[Math.floor(Math.random() * legal.length)];
      return { move: pick(m), san: m.san, score: 0, depth: 0, nodes: 0, book: false, thought: 'Following a hunch…' };
    }

    this.nodes = 0;
    this.deadline = performance.now() + cfg.timeMs;
    this.killers = [];
    this.history.clear();

    let rootMoves = legal.map((m) => ({ m, score: mvvLva(m) }));
    rootMoves.sort((a, b) => b.score - a.score);
    let best = rootMoves[0];
    let bestDepth = 0;

    for (let depth = 1; depth <= cfg.depth; depth++) {
      try {
        let alpha = -Infinity;
        const scored = [];
        for (const rm of rootMoves) {
          chess.move(rm.m);
          let s = -this.search(chess, depth - 1, -Infinity, -alpha + cfg.noise * 2, 1);
          chess.undo();
          scored.push({ m: rm.m, score: s });
          if (s > alpha) alpha = s;
        }
        scored.sort((a, b) => b.score - a.score);
        rootMoves = scored;
        best = scored[0];
        bestDepth = depth;
        if (Math.abs(best.score) > MATE - 100) break;
      } catch (e) {
        if (e instanceof TimeUp) break;
        throw e;
      }
    }

    // Human-like choice: among near-best moves pick one at random.
    let choice = best;
    if (cfg.noise > 0) {
      const pool = rootMoves.filter((x) => x.score >= best.score - cfg.noise);
      choice = pool[Math.floor(Math.random() * pool.length)];
    }

    return {
      move: pick(choice.m),
      san: choice.m.san,
      score: choice.score,
      depth: bestDepth,
      nodes: this.nodes,
      book: false,
      thought: describe(choice),
    };
  }

  search(chess, depth, alpha, beta, ply) {
    if ((++this.nodes & 1023) === 0 && performance.now() > this.deadline) throw new TimeUp();
    if (depth <= 0) return this.quiesce(chess, alpha, beta, 0);

    const moves = chess.moves({ verbose: true });
    if (!moves.length) return chess.inCheck() ? -MATE + ply : 0;
    if (chess.isInsufficientMaterial() || chess.isDrawByFiftyMoves?.()) return 0;

    const killers = this.killers[ply] || [];
    for (const m of moves) {
      const id = m.from + m.to;
      m._o = mvvLva(m) + (killers.includes(id) ? 8000 : 0) + (this.history.get(id) || 0);
    }
    moves.sort((a, b) => b._o - a._o);

    const inCheck = chess.inCheck();
    for (const m of moves) {
      chess.move(m);
      const score = -this.search(chess, depth - 1 + (inCheck ? 1 : 0) * (ply < 6 ? 1 : 0), -beta, -alpha, ply + 1);
      chess.undo();
      if (score >= beta) {
        if (!m.captured) {
          const id = m.from + m.to;
          const k = (this.killers[ply] ||= []);
          if (k[0] !== id) { k[1] = k[0]; k[0] = id; }
          this.history.set(id, (this.history.get(id) || 0) + depth * depth);
        }
        return beta;
      }
      if (score > alpha) alpha = score;
    }
    return alpha;
  }

  quiesce(chess, alpha, beta, qply) {
    if ((++this.nodes & 1023) === 0 && performance.now() > this.deadline) throw new TimeUp();
    const stand = evaluate(chess);
    if (stand >= beta) return beta;
    if (stand > alpha) alpha = stand;
    if (qply > 5) return alpha;

    const caps = chess.moves({ verbose: true }).filter((m) => m.captured || m.promotion);
    caps.sort((a, b) => mvvLva(b) - mvvLva(a));
    for (const m of caps) {
      // Delta pruning: skip captures that cannot raise alpha.
      if (stand + VALUE[m.captured || 'p'] + 200 < alpha && !m.promotion) continue;
      chess.move(m);
      const score = -this.quiesce(chess, -beta, -alpha, qply + 1);
      chess.undo();
      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
    }
    return alpha;
  }
}

function pick(m) {
  return { from: m.from, to: m.to, promotion: m.promotion };
}

function describe({ m, score }) {
  if (m.san.includes('#')) return 'Checkmate.';
  if (score > MATE - 100) return `Mate is coming. ${m.san}.`;
  if (score < -MATE + 100) return `Desperate defence: ${m.san}.`;
  if (m.captured) return `Taking material with ${m.san}.`;
  if (m.san.includes('+')) return `Pressure on the king: ${m.san}.`;
  if (m.san.startsWith('O-O')) return 'Tucking the king away.';
  if (score > 150) return `I like my position (${(score / 100).toFixed(1)}).`;
  if (score < -150) return `Fighting back (${(score / 100).toFixed(1)}).`;
  return `Improving with ${m.san}.`;
}
