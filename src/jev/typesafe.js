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
 * TypeSafe Jev's ranked moves as a prior for the search: { uci: probability }.
 * The search still plays out the opponent's replies to every move, so the prior
 * only decides between moves of similar value (see LEVELS.priorWeight).
 * Missing, negative or non-numeric probabilities count as 0.
 * @returns {Record<string, number>}
 */
export function toPriors(ranked) {
  const priors = {};
  for (const m of ranked || []) {
    const p = Number(m?.p);
    if (typeof m?.uci === 'string') priors[m.uci] = Number.isFinite(p) && p > 0 ? p : 0;
  }
  return priors;
}
