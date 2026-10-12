// Server-side bridge to TypeSafe Jev (https://docs.typesafe.ai).
// The API key never reaches the browser: the page POSTs a position here, we
// build the state + typed questions, and return Jev's ranked move choice.
import { Chess } from 'chess.js';
import { TypeSafeClient, choice, score } from '@typesafe-ai/sdk';

const PIECE_NAME = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
const SIDE = { w: 'White', b: 'Black' };

let client = null;
export const isConfigured = () => Boolean(process.env.TYPESAFE_API_KEY);
function getClient() {
  client ||= new TypeSafeClient({ timeout: 8000, retry: { maxRetries: 1 } });
  return client;
}

const uci = (m) => m.from + m.to + (m.promotion || '');

function describeMove(m) {
  const parts = [`${m.san}: ${PIECE_NAME[m.piece]} ${m.from} to ${m.to}`];
  if (m.flags.includes('k')) parts.push('castles kingside');
  if (m.flags.includes('q')) parts.push('castles queenside');
  if (m.captured) parts.push(`captures ${PIECE_NAME[m.captured]}${m.flags.includes('e') ? ' en passant' : ''}`);
  if (m.promotion) parts.push(`promotes to ${PIECE_NAME[m.promotion]}`);
  if (m.san.endsWith('#')) parts.push('checkmate');
  else if (m.san.endsWith('+')) parts.push('gives check');
  return parts.join(', ');
}

function material(chess) {
  const v = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
  const out = { w: 0, b: 0 };
  for (const row of chess.board()) for (const p of row) if (p) out[p.color] += v[p.type];
  return out;
}

function buildState(chess, history) {
  const pieces = { White: [], Black: [] };
  for (const row of chess.board()) for (const p of row) if (p) pieces[SIDE[p.color]].push(`${PIECE_NAME[p.type]} ${p.square}`);
  const mat = material(chess);
  return {
    game: 'standard chess',
    fen: chess.fen(),
    side_to_move: SIDE[chess.turn()],
    in_check: chess.inCheck(),
    board: chess.ascii(),
    pieces,
    material: { White: mat.w, Black: mat.b },
    recent_moves: history.slice(-16).join(' ') || '(game start)',
    move_number: chess.moveNumber(),
  };
}

/**
 * @param {{ fen: string, history?: string[] }} body
 * @returns {Promise<{ status: number, json: object }>}
 */
export async function decide(body) {
  if (!isConfigured()) return { status: 503, json: { error: 'TYPESAFE_API_KEY is not set' } };
  if (!body || typeof body.fen !== 'string' || body.fen.length > 120) return { status: 400, json: { error: 'Invalid fen' } };

  let chess;
  try { chess = new Chess(body.fen); } catch { return { status: 400, json: { error: 'Invalid fen' } }; }
  const legal = chess.moves({ verbose: true });
  if (!legal.length) return { status: 400, json: { error: 'No legal moves' } };
  const history = Array.isArray(body.history) ? body.history.filter((s) => typeof s === 'string').slice(-200) : [];

  const side = SIDE[chess.turn()];
  const criteria = Object.fromEntries(legal.map((m) => [uci(m), describeMove(m)]));

  const t0 = Date.now();
  const { answers, model, usage } = await getClient().systemOne({
    state: buildState(chess, history),
    questions: {
      move: choice(
        {
          task: `You are Jev, playing ${side} in a chess game against a human. Choose the strongest legal move.`,
          priorities: [
            'deliver checkmate if available',
            'do not leave pieces undefended or hang material',
            'win material when it is safe',
            'get out of check',
            'develop pieces, control the centre, keep the king safe',
          ],
        },
        criteria,
      ),
      assessment: score(`Who is better in this position from ${side}'s point of view?`, [
        `${side} is losing badly`,
        `${side} is somewhat worse`,
        'the position is roughly equal',
        `${side} is somewhat better`,
        `${side} is winning`,
      ]),
    },
  });

  const byUci = new Map(legal.map((m) => [uci(m), m]));
  const ranked = Object.entries(answers.move.probabilities)
    .filter(([k]) => byUci.has(k))
    .sort((a, b) => b[1] - a[1])
    .map(([k, p]) => {
      const m = byUci.get(k);
      return { uci: k, san: m.san, from: m.from, to: m.to, promotion: m.promotion, p };
    });
  if (!ranked.length) return { status: 502, json: { error: 'TypeSafe Jev returned no legal moves' } };

  return {
    status: 200,
    json: {
      model,
      choice: answers.move.choice,
      confidence: answers.move.confidence,
      ranked,
      assessment: answers.assessment.score, // 0 (losing) … 4 (winning)
      usage,
      ms: Date.now() - t0,
    },
  };
}

// Tiny per-IP rate limit so a public deployment can't be used to drain the key.
const hits = new Map();
export function rateLimited(ip, limit = 90, windowMs = 60_000) {
  const now = Date.now();
  const h = hits.get(ip) || { n: 0, t: now };
  if (now - h.t > windowMs) { h.n = 0; h.t = now; }
  h.n++;
  hits.set(ip, h);
  if (hits.size > 5000) hits.clear();
  return h.n > limit;
}

/** Framework-agnostic request handler used by the Vite dev server and the Vercel function. */
export async function handle(method, body, ip = 'local') {
  if (method === 'GET') return { status: 200, json: { enabled: isConfigured() } };
  if (method !== 'POST') return { status: 405, json: { error: 'Method not allowed' } };
  if (rateLimited(ip)) return { status: 429, json: { error: 'Too many requests' } };
  try {
    return await decide(body);
  } catch (e) {
    console.error('[typesafe-jev]', e?.message || e);
    return { status: 502, json: { error: 'TypeSafe Jev request failed' } };
  }
}
