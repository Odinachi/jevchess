// Jev — the decision model that plays the black (or white) pieces.
// It scores positions with material + piece-square tables + king safety,
// then picks a move with iterative-deepening alpha-beta search,
// quiescence on captures, MVV-LVA / killer move ordering and a small
// opening book. Lower levels add controlled randomness so Jev feels human.
import { Chess } from 'chess.js';
import { Board, P, N, B, R, Q, K, F_CAP, mFrom, mTo, mPromo, mFlags, toUci } from './board.js';

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
  beginner: { name: 'Beginner', depth: 1, timeMs: 250, noise: 180, blunder: 0.25, book: false },
  pro: { name: 'Pro', depth: 5, timeMs: 900, noise: 20, blunder: 0, book: true },
  legendary: { name: 'Legendary', depth: 64, timeMs: 3000, noise: 0, blunder: 0, book: true },
};

const TYPE = [0, 'p', 'n', 'b', 'r', 'q', 'k'];
const VAL = [0, 100, 320, 335, 500, 950, 20000];
const TT_SIZE = 1 << 20;
const TT_EXACT = 1, TT_LOWER = 2, TT_UPPER = 3;

// Flatten PSTs into 0x88-indexed arrays per piece & colour for fast lookup.
const PST88 = {};
for (const t of ['p', 'n', 'b', 'r', 'q', 'k', 'kEnd']) {
  const w = new Int16Array(128), b = new Int16Array(128);
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
    w[r * 16 + f] = PST[t][(7 - r) * 8 + f];
    b[r * 16 + f] = PST[t][r * 8 + f];
  }
  PST88[t] = [w, b];
}

function evaluate(bd) {
  const b = bd.b;
  let score = 0, nonPawn = 0, wBish = 0, bBish = 0;
  const wPawnFiles = new Int8Array(8), bPawnFiles = new Int8Array(8);
  for (let s = 0; s < 120; s++) {
    if (s & 0x88) { s += 7; continue; }
    const p = b[s];
    if (!p) continue;
    const t = p > 0 ? p : -p;
    if (t === K) continue;
    const white = p > 0;
    if (t !== P) nonPawn += VAL[t];
    else (white ? wPawnFiles : bPawnFiles)[s & 7]++;
    if (t === B) white ? wBish++ : bBish++;
    const v = VAL[t] + PST88[TYPE[t]][white ? 0 : 1][s];
    score += white ? v : -v;
  }
  const phase = Math.min(1, nonPawn / 6200);
  const kw = PST88.k[0][bd.wk] * phase + PST88.kEnd[0][bd.wk] * (1 - phase);
  const kb = PST88.k[1][bd.bk] * phase + PST88.kEnd[1][bd.bk] * (1 - phase);
  score += kw - kb;
  if (wBish >= 2) score += 30;
  if (bBish >= 2) score -= 30;
  // Doubled and isolated pawns.
  for (let f = 0; f < 8; f++) {
    if (wPawnFiles[f] > 1) score -= 15 * (wPawnFiles[f] - 1);
    if (bPawnFiles[f] > 1) score += 15 * (bPawnFiles[f] - 1);
    const wIso = wPawnFiles[f] && !(f > 0 && wPawnFiles[f - 1]) && !(f < 7 && wPawnFiles[f + 1]);
    const bIso = bPawnFiles[f] && !(f > 0 && bPawnFiles[f - 1]) && !(f < 7 && bPawnFiles[f + 1]);
    if (wIso) score -= 12;
    if (bIso) score += 12;
  }
  return (score * bd.side) | 0;
}

class TimeUp extends Error {}

export class Jev {
  constructor() {
    this.ttKey = new Uint32Array(TT_SIZE);
    this.ttMove = new Int32Array(TT_SIZE);
    this.ttScore = new Int32Array(TT_SIZE);
    this.ttDepth = new Int8Array(TT_SIZE);
    this.ttFlag = new Int8Array(TT_SIZE);
    this.history = new Int32Array(128 * 128);
  }

  /**
   * @param {string} fen current position
   * @param {string[]} sanHistory moves played so far (for the opening book)
   * @param {'beginner'|'pro'|'legendary'} level
   * @param {string[]} [pastFens] earlier positions, for repetition detection
   */
  think(fen, sanHistory, level = 'pro', pastFens = []) {
    const cfg = LEVELS[level] || LEVELS.pro;
    const chess = new Chess(fen);
    const legal = chess.moves({ verbose: true });
    if (!legal.length) return null;
    const toSan = (u) => legal.find((x) => x.from === u.from && x.to === u.to && (x.promotion || undefined) === u.promotion)?.san;

    const key = sanHistory.join(' ');
    const bookMoves = (BOOK[key] || []).filter((san) => legal.some((m) => m.san === san));
    if (bookMoves.length && cfg.book) {
      const san = bookMoves[Math.floor(Math.random() * bookMoves.length)];
      const m = legal.find((x) => x.san === san);
      return { move: { from: m.from, to: m.to, promotion: m.promotion }, san, score: 0, depth: 0, nodes: 0, book: true, thought: 'Book move — known theory.' };
    }
    if (Math.random() < cfg.blunder) {
      const m = legal[Math.floor(Math.random() * legal.length)];
      return { move: { from: m.from, to: m.to, promotion: m.promotion }, san: m.san, score: 0, depth: 0, nodes: 0, book: false, thought: 'Following a hunch…' };
    }

    const bd = new Board(fen);
    this.bd = bd;
    this.past = pastFens.map((f) => new Board(f).hash);
    this.nodes = 0;
    this.deadline = performance.now() + cfg.timeMs;
    this.killers = Array.from({ length: 128 }, () => [0, 0]);
    this.history.fill(0);

    let root = bd.gen().filter((m) => bd.make(m) && (bd.unmake(), true)).map((m) => ({ m, score: 0 }));
    let best = root[0];
    let depthDone = 0;

    for (let depth = 1; depth <= cfg.depth; depth++) {
      try {
        let alpha = -MATE - 1;
        const window = cfg.noise;
        for (const r of root) {
          bd.make(r.m);
          r.score = this.repeated() ? 0 : -this.search(depth - 1, -MATE - 1, -(alpha - window), 1, true);
          bd.unmake();
          if (r.score > alpha) alpha = r.score;
        }
        root.sort((a, b) => b.score - a.score);
        best = root[0];
        depthDone = depth;
        if (Math.abs(best.score) > MATE - 200) break;
        if (performance.now() > this.deadline - cfg.timeMs * 0.45 && depth >= 2) break; // next ply won't finish
      } catch (e) {
        if (!(e instanceof TimeUp)) throw e;
        // Partial iteration: keep previous ordering but trust a move that beat it.
        root.sort((a, b) => b.score - a.score);
        break;
      }
    }

    let choice = best;
    // Human-like variety: pick among moves scoring within `noise` of the best.
    // Strict > excludes moves that merely failed low against the window bound.
    if (cfg.noise > 0 && (best.score < MATE - 200 || level === 'beginner')) {
      const pool = root.filter((x) => x.score > best.score - cfg.noise);
      choice = pool[Math.floor(Math.random() * pool.length)];
    }
    const move = toUci(choice.m);
    const san = toSan(move);
    return { move, san, score: choice.score, depth: depthDone, nodes: this.nodes, book: false, thought: describe(san, choice.score) };
  }

  repeated() {
    const bd = this.bd, h = bd.hash;
    const st = bd.stack;
    for (let i = st.length - 2; i >= 0 && i >= st.length - 1 - bd.half; i -= 2) if (st[i].hash === h) return true;
    if (bd.half >= 100) return true;
    return this.past.includes(h);
  }

  search(depth, alpha, beta, ply, allowNull) {
    const bd = this.bd;
    if ((++this.nodes & 2047) === 0 && performance.now() > this.deadline) throw new TimeUp();
    const inCheck = bd.inCheck();
    if (inCheck) depth++;
    if (depth <= 0) return this.quiesce(alpha, beta, ply);

    const idx = bd.hash & (TT_SIZE - 1);
    let ttMove = 0;
    if (this.ttKey[idx] === bd.hash) {
      ttMove = this.ttMove[idx];
      if (this.ttDepth[idx] >= depth) {
        let s = this.ttScore[idx];
        if (s > MATE - 500) s -= ply; else if (s < -MATE + 500) s += ply;
        const fl = this.ttFlag[idx];
        if (fl === TT_EXACT || (fl === TT_LOWER && s >= beta) || (fl === TT_UPPER && s <= alpha)) return s;
      }
    }

    // Null-move pruning.
    if (allowNull && !inCheck && depth >= 3 && beta < MATE - 500 && this.hasPieces() && evaluate(bd) >= beta) {
      bd.makeNull();
      const s = -this.search(depth - 3, -beta, -beta + 1, ply + 1, false);
      bd.unmakeNull();
      if (s >= beta) return beta;
    }

    const moves = bd.gen();
    const scores = new Int32Array(moves.length);
    const kl = this.killers[ply] || [0, 0];
    for (let i = 0; i < moves.length; i++) scores[i] = this.order(moves[i], ttMove, kl);

    const alpha0 = alpha;
    let bestMove = 0, bestScore = -MATE - 1, legalCount = 0;
    for (let i = 0; i < moves.length; i++) {
      // Selection sort step: bring best-ordered move forward lazily.
      let bi = i;
      for (let j = i + 1; j < moves.length; j++) if (scores[j] > scores[bi]) bi = j;
      if (bi !== i) { [moves[i], moves[bi]] = [moves[bi], moves[i]]; [scores[i], scores[bi]] = [scores[bi], scores[i]]; }
      const m = moves[i];
      if (!bd.make(m)) continue;
      legalCount++;
      let s;
      if (this.repeated()) s = 0;
      else if (legalCount === 1) s = -this.search(depth - 1, -beta, -alpha, ply + 1, true);
      else {
        // Late move reduction for quiet moves, then PVS re-search.
        const quiet = !(mFlags(m) & F_CAP) && !mPromo(m);
        const red = quiet && depth >= 3 && legalCount > 3 && !inCheck ? 1 : 0;
        s = -this.search(depth - 1 - red, -alpha - 1, -alpha, ply + 1, true);
        if (s > alpha && s < beta) s = -this.search(depth - 1, -beta, -alpha, ply + 1, true);
      }
      bd.unmake();
      if (s > bestScore) { bestScore = s; bestMove = m; }
      if (s > alpha) alpha = s;
      if (alpha >= beta) {
        if (!(mFlags(m) & F_CAP)) {
          if (kl[0] !== m) { kl[1] = kl[0]; kl[0] = m; this.killers[ply] = kl; }
          this.history[mFrom(m) * 128 + mTo(m)] += depth * depth;
        }
        break;
      }
    }
    if (!legalCount) return inCheck ? -MATE + ply : 0;

    let store = bestScore;
    if (store > MATE - 500) store += ply; else if (store < -MATE + 500) store -= ply;
    this.ttKey[idx] = bd.hash;
    this.ttMove[idx] = bestMove;
    this.ttScore[idx] = store;
    this.ttDepth[idx] = depth;
    this.ttFlag[idx] = bestScore >= beta ? TT_LOWER : bestScore <= alpha0 ? TT_UPPER : TT_EXACT;
    return bestScore;
  }

  quiesce(alpha, beta, ply) {
    const bd = this.bd;
    if ((++this.nodes & 2047) === 0 && performance.now() > this.deadline) throw new TimeUp();
    const stand = evaluate(bd);
    if (stand >= beta) return beta;
    if (stand > alpha) alpha = stand;
    if (ply > 40) return alpha;
    const moves = bd.gen(true);
    const scores = moves.map((m) => this.order(m, 0, null));
    for (let i = 0; i < moves.length; i++) {
      let bi = i;
      for (let j = i + 1; j < moves.length; j++) if (scores[j] > scores[bi]) bi = j;
      if (bi !== i) { [moves[i], moves[bi]] = [moves[bi], moves[i]]; [scores[i], scores[bi]] = [scores[bi], scores[i]]; }
      const m = moves[i];
      const victim = bd.b[mTo(m)];
      if (!mPromo(m) && stand + VAL[victim < 0 ? -victim : victim || P] + 200 < alpha) continue;
      if (!bd.make(m)) continue;
      const s = -this.quiesce(-beta, -alpha, ply + 1);
      bd.unmake();
      if (s >= beta) return beta;
      if (s > alpha) alpha = s;
    }
    return alpha;
  }

  order(m, ttMove, kl) {
    if (m === ttMove) return 1 << 30;
    const b = this.bd.b;
    let s = 0;
    if (mFlags(m) & F_CAP) {
      const v = b[mTo(m)], a = b[mFrom(m)];
      s = 1000000 + 10 * VAL[v ? (v < 0 ? -v : v) : P] - VAL[a < 0 ? -a : a];
    }
    if (mPromo(m)) s += 900000 + VAL[mPromo(m)];
    if (!s && kl) {
      if (m === kl[0]) s = 800000; else if (m === kl[1]) s = 790000;
      else s = this.history[mFrom(m) * 128 + mTo(m)];
    }
    return s;
  }

  hasPieces() {
    const b = this.bd.b, us = this.bd.side;
    for (let s = 0; s < 120; s++) {
      if (s & 0x88) { s += 7; continue; }
      const t = b[s] * us;
      if (t > P && t < K) return true;
    }
    return false;
  }
}

function describe(san, score) {
  if (!san) return '';
  if (san.includes('#')) return 'Checkmate.';
  if (score > MATE - 200) return `I see mate in ${Math.ceil((MATE - score) / 2)}. ${san}.`;
  if (score < -MATE + 200) return `Desperate defence: ${san}.`;
  if (san.includes('x')) return `Taking material with ${san}.`;
  if (san.includes('+')) return `Pressure on the king: ${san}.`;
  if (san.startsWith('O-O')) return 'Tucking the king away.';
  if (score > 150) return `I like my position (+${(score / 100).toFixed(1)}).`;
  if (score < -150) return `Fighting back (${(score / 100).toFixed(1)}).`;
  return `Improving with ${san}.`;
}
