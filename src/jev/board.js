// Fast 0x88 board used by Jev's search. chess.js stays the source of truth
// for the game itself; this exists purely for speed (make/unmake, no SAN).
export const P = 1, N = 2, B = 3, R = 4, Q = 5, K = 6;
export const F_CAP = 1, F_EP = 2, F_CASTLE = 4, F_DOUBLE = 8;

const KNIGHT = [33, 31, 18, 14, -33, -31, -18, -14];
const KING = [1, -1, 16, -16, 15, 17, -15, -17];
const DIAG = [15, 17, -15, -17];
const ORTHO = [1, -1, 16, -16];
const PIECE_CHAR = { p: P, n: N, b: B, r: R, q: Q, k: K };

// Castling-rights mask per square (1 WK, 2 WQ, 4 BK, 8 BQ).
const CASTLE_MASK = new Int8Array(128).fill(15);
CASTLE_MASK[4] = 12; CASTLE_MASK[7] = 14; CASTLE_MASK[0] = 13;
CASTLE_MASK[116] = 3; CASTLE_MASK[119] = 11; CASTLE_MASK[112] = 7;

function rand32() { return (Math.random() * 0x100000000) >>> 0; }
const Z_PIECE = Array.from({ length: 13 }, () => Uint32Array.from({ length: 128 }, rand32));
const Z_CASTLE = Uint32Array.from({ length: 16 }, rand32);
const Z_EP = Uint32Array.from({ length: 8 }, rand32);
const Z_SIDE = rand32();

export const encode = (from, to, promo = 0, flags = 0) => from | (to << 7) | (promo << 14) | (flags << 17);
export const mFrom = (m) => m & 127;
export const mTo = (m) => (m >> 7) & 127;
export const mPromo = (m) => (m >> 14) & 7;
export const mFlags = (m) => (m >> 17) & 15;

export const sqName = (s) => 'abcdefgh'[s & 7] + ((s >> 4) + 1);
export const sqIndex = (n) => (n.charCodeAt(1) - 49) * 16 + (n.charCodeAt(0) - 97);

export class Board {
  constructor(fen) {
    this.b = new Int8Array(128);
    this.stack = [];
    this.load(fen);
  }

  load(fen) {
    const [placement, side, castle, ep, half] = fen.split(' ');
    this.b.fill(0);
    let r = 7, f = 0;
    for (const c of placement) {
      if (c === '/') { r--; f = 0; continue; }
      if (c >= '1' && c <= '8') { f += +c; continue; }
      const t = PIECE_CHAR[c.toLowerCase()];
      const sq = r * 16 + f;
      this.b[sq] = c === c.toUpperCase() ? t : -t;
      if (t === K) this[c === 'K' ? 'wk' : 'bk'] = sq;
      f++;
    }
    this.side = side === 'w' ? 1 : -1;
    this.castle = (castle.includes('K') ? 1 : 0) | (castle.includes('Q') ? 2 : 0) |
      (castle.includes('k') ? 4 : 0) | (castle.includes('q') ? 8 : 0);
    this.ep = ep && ep !== '-' ? sqIndex(ep) : -1;
    this.half = +half || 0;
    this.hash = this.computeHash();
    this.stack.length = 0;
  }

  computeHash() {
    let h = 0;
    for (let s = 0; s < 128; s++) if (!(s & 0x88) && this.b[s]) h ^= Z_PIECE[this.b[s] + 6][s];
    h ^= Z_CASTLE[this.castle];
    if (this.ep >= 0) h ^= Z_EP[this.ep & 7];
    if (this.side === -1) h ^= Z_SIDE;
    return h >>> 0;
  }

  attacked(sq, by) {
    const b = this.b;
    // Pawns
    if (by === 1) {
      if (!((sq - 15) & 0x88) && b[sq - 15] === P) return true;
      if (!((sq - 17) & 0x88) && b[sq - 17] === P) return true;
    } else {
      if (!((sq + 15) & 0x88) && b[sq + 15] === -P) return true;
      if (!((sq + 17) & 0x88) && b[sq + 17] === -P) return true;
    }
    for (let i = 0; i < 8; i++) {
      const t = sq + KNIGHT[i];
      if (!(t & 0x88) && b[t] === N * by) return true;
      const k = sq + KING[i];
      if (!(k & 0x88) && b[k] === K * by) return true;
    }
    for (let i = 0; i < 4; i++) {
      let d = DIAG[i], t = sq + d;
      while (!(t & 0x88)) {
        const p = b[t];
        if (p) { if (p === B * by || p === Q * by) return true; break; }
        t += d;
      }
      d = ORTHO[i]; t = sq + d;
      while (!(t & 0x88)) {
        const p = b[t];
        if (p) { if (p === R * by || p === Q * by) return true; break; }
        t += d;
      }
    }
    return false;
  }

  inCheck() {
    return this.attacked(this.side === 1 ? this.wk : this.bk, -this.side);
  }

  /** Pseudo-legal moves; legality is checked in make(). */
  gen(capturesOnly = false) {
    const b = this.b, us = this.side, out = [];
    for (let from = 0; from < 128; from++) {
      if (from & 0x88) { from += 7; continue; }
      const p = b[from];
      if (!p || (p > 0) !== (us > 0)) continue;
      const t = p * us;
      if (t === P) {
        const fwd = 16 * us;
        const rank = from >> 4;
        const promoRank = us === 1 ? 6 : 1;
        const startRank = us === 1 ? 1 : 6;
        const one = from + fwd;
        if (!b[one]) {
          if (rank === promoRank) {
            out.push(encode(from, one, Q), encode(from, one, N));
            if (!capturesOnly) out.push(encode(from, one, R), encode(from, one, B));
          } else if (!capturesOnly) {
            out.push(encode(from, one));
            if (rank === startRank && !b[one + fwd]) out.push(encode(from, one + fwd, 0, F_DOUBLE));
          }
        }
        for (const d of [fwd - 1, fwd + 1]) {
          const to = from + d;
          if (to & 0x88) continue;
          if (b[to] && (b[to] > 0) !== (us > 0)) {
            if (rank === promoRank) {
              out.push(encode(from, to, Q, F_CAP), encode(from, to, N, F_CAP));
              if (!capturesOnly) out.push(encode(from, to, R, F_CAP), encode(from, to, B, F_CAP));
            } else out.push(encode(from, to, 0, F_CAP));
          } else if (to === this.ep) out.push(encode(from, to, 0, F_CAP | F_EP));
        }
        continue;
      }
      if (t === N || t === K) {
        const dirs = t === N ? KNIGHT : KING;
        for (let i = 0; i < 8; i++) {
          const to = from + dirs[i];
          if (to & 0x88) continue;
          const q = b[to];
          if (!q) { if (!capturesOnly) out.push(encode(from, to)); }
          else if ((q > 0) !== (us > 0)) out.push(encode(from, to, 0, F_CAP));
        }
        if (t === K && !capturesOnly) this.genCastles(from, out);
        continue;
      }
      const dirs = t === B ? DIAG : t === R ? ORTHO : KING;
      for (let i = 0; i < dirs.length; i++) {
        const d = dirs[i];
        let to = from + d;
        while (!(to & 0x88)) {
          const q = b[to];
          if (!q) { if (!capturesOnly) out.push(encode(from, to)); }
          else { if ((q > 0) !== (us > 0)) out.push(encode(from, to, 0, F_CAP)); break; }
          to += d;
        }
      }
    }
    return out;
  }

  genCastles(from, out) {
    const b = this.b, us = this.side;
    if (us === 1 && from === 4) {
      if (this.castle & 1 && !b[5] && !b[6] && b[7] === R &&
        !this.attacked(4, -1) && !this.attacked(5, -1) && !this.attacked(6, -1)) out.push(encode(4, 6, 0, F_CASTLE));
      if (this.castle & 2 && !b[3] && !b[2] && !b[1] && b[0] === R &&
        !this.attacked(4, -1) && !this.attacked(3, -1) && !this.attacked(2, -1)) out.push(encode(4, 2, 0, F_CASTLE));
    } else if (us === -1 && from === 116) {
      if (this.castle & 4 && !b[117] && !b[118] && b[119] === -R &&
        !this.attacked(116, 1) && !this.attacked(117, 1) && !this.attacked(118, 1)) out.push(encode(116, 118, 0, F_CASTLE));
      if (this.castle & 8 && !b[115] && !b[114] && !b[113] && b[112] === -R &&
        !this.attacked(116, 1) && !this.attacked(115, 1) && !this.attacked(114, 1)) out.push(encode(116, 114, 0, F_CASTLE));
    }
  }

  /** Returns false (and leaves the board unchanged) if the move is illegal. */
  make(m) {
    const b = this.b, us = this.side;
    const from = mFrom(m), to = mTo(m), promo = mPromo(m), flags = mFlags(m);
    const piece = b[from];
    const capSq = flags & F_EP ? to - 16 * us : to;
    const captured = b[capSq];
    this.stack.push({ m, captured, castle: this.castle, ep: this.ep, half: this.half, hash: this.hash });

    let h = this.hash ^ Z_CASTLE[this.castle];
    if (this.ep >= 0) h ^= Z_EP[this.ep & 7];
    if (captured) { h ^= Z_PIECE[captured + 6][capSq]; b[capSq] = 0; }
    const placed = promo ? promo * us : piece;
    h ^= Z_PIECE[piece + 6][from] ^ Z_PIECE[placed + 6][to];
    b[from] = 0; b[to] = placed;

    if (flags & F_CASTLE) {
      let rf, rt;
      if (to === 6) { rf = 7; rt = 5; } else if (to === 2) { rf = 0; rt = 3; }
      else if (to === 118) { rf = 119; rt = 117; } else { rf = 112; rt = 115; }
      const rook = b[rf];
      b[rt] = rook; b[rf] = 0;
      h ^= Z_PIECE[rook + 6][rf] ^ Z_PIECE[rook + 6][rt];
    }
    if (piece === K) this.wk = to; else if (piece === -K) this.bk = to;

    this.castle &= CASTLE_MASK[from] & CASTLE_MASK[to];
    this.ep = flags & F_DOUBLE ? from + 16 * us : -1;
    this.half = captured || piece * us === P ? 0 : this.half + 1;
    h ^= Z_CASTLE[this.castle];
    if (this.ep >= 0) h ^= Z_EP[this.ep & 7];
    this.hash = (h ^ Z_SIDE) >>> 0;
    this.side = -us;

    if (this.attacked(us === 1 ? this.wk : this.bk, -us)) { this.unmake(); return false; }
    return true;
  }

  unmake() {
    const u = this.stack.pop();
    const b = this.b;
    this.side = -this.side;
    const us = this.side;
    const m = u.m, from = mFrom(m), to = mTo(m), promo = mPromo(m), flags = mFlags(m);
    const piece = promo ? P * us : b[to];
    b[from] = piece; b[to] = 0;
    if (u.captured) b[flags & F_EP ? to - 16 * us : to] = u.captured;
    if (flags & F_CASTLE) {
      let rf, rt;
      if (to === 6) { rf = 7; rt = 5; } else if (to === 2) { rf = 0; rt = 3; }
      else if (to === 118) { rf = 119; rt = 117; } else { rf = 112; rt = 115; }
      b[rf] = b[rt]; b[rt] = 0;
    }
    if (piece === K) this.wk = from; else if (piece === -K) this.bk = from;
    this.castle = u.castle; this.ep = u.ep; this.half = u.half; this.hash = u.hash;
  }

  makeNull() {
    this.stack.push({ m: -1, castle: this.castle, ep: this.ep, half: this.half, hash: this.hash });
    let h = this.hash;
    if (this.ep >= 0) h ^= Z_EP[this.ep & 7];
    this.ep = -1;
    this.hash = (h ^ Z_SIDE) >>> 0;
    this.side = -this.side;
  }

  unmakeNull() {
    const u = this.stack.pop();
    this.side = -this.side;
    this.ep = u.ep; this.hash = u.hash; this.half = u.half; this.castle = u.castle;
  }
}

export function toUci(m) {
  const promo = mPromo(m);
  return { from: sqName(mFrom(m)), to: sqName(mTo(m)), promotion: promo ? ' pnbrqk'[promo] : undefined };
}
