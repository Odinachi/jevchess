// Browser side of the TypeSafe Jev integration. Talks only to our own /api/jev
// endpoint (which holds the API key) and turns Jev's typed answer into a move.

let enabledPromise = null;

/** Whether the server has a TypeSafe API key configured. Cached for the session. */
export function typesafeEnabled() {
  enabledPromise ||= fetch('/api/jev', { method: 'GET' })
    .then((r) => (r.ok ? r.json() : { enabled: false }))
    .then((j) => Boolean(j.enabled))
    .catch(() => false);
  return enabledPromise;
}

/**
 * @returns {Promise<{ choice: string, confidence: number, ranked: Array<{uci:string,san:string,from:string,to:string,promotion?:string,p:number}>, assessment: number, ms: number, model: string }>}
 */
export async function askTypeSafeJev(fen, history, { timeoutMs = 9000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch('/api/jev', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fen, history }),
      signal: ctrl.signal,
    });
    if (!r.ok) throw new Error(`TypeSafe Jev HTTP ${r.status}`);
    const data = await r.json();
    if (!data.ranked?.length) throw new Error('TypeSafe Jev returned no moves');
    return data;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Difficulty policy over Jev's move distribution.
 * - beginner:  sample with a high temperature (flattened) from Jev's top moves
 * - pro:       play Jev's top choice
 * - legendary: shortlist Jev's most probable moves for the local search to verify
 * @returns {{ pick?: object, candidates?: string[] }}
 */
export function applyPolicy(ranked, level, rand = Math.random) {
  if (level === 'beginner') {
    const pool = ranked.slice(0, 8);
    const T = 2.2;
    const w = pool.map((m) => Math.pow(Math.max(Number(m.p) || 0, 1e-6), 1 / T));
    const total = w.reduce((a, b) => a + b, 0);
    let x = rand() * total;
    for (let i = 0; i < pool.length; i++) if ((x -= w[i]) <= 0) return { pick: pool[i] };
    return { pick: pool[0] };
  }
  if (level === 'legendary') {
    const candidates = [];
    let mass = 0;
    for (const m of ranked) {
      if (candidates.length >= 6 || (candidates.length >= 3 && mass >= 0.9)) break;
      candidates.push(m.uci);
      mass += m.p;
    }
    // Never let the shortlist hide an immediate mate.
    for (const m of ranked) if (m.san.endsWith('#') && !candidates.includes(m.uci)) candidates.push(m.uci);
    return { pick: ranked[0], candidates };
  }
  return { pick: ranked[0] };
}

const ASSESS = ['I’m in trouble here.', 'Slightly uncomfortable.', 'Balanced game.', 'I like my position.', 'This is going my way.'];

export function typesafeThought(pick, data) {
  const conf = Math.round((data.confidence ?? 0) * 100);
  const a = ASSESS[Math.max(0, Math.min(4, Math.round(data.assessment ?? 2)))];
  if (pick.san.endsWith('#')) return 'Checkmate.';
  return `${pick.san}. ${a}${conf ? ` (${conf}% sure)` : ''}`;
}
