// Running tally of results between the player and Jev, kept across games.
const KEY = 'jevchess.score';
const EMPTY = { player: 0, jev: 0, draws: 0, games: [] };

function load() {
  try { return { ...EMPTY, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { ...EMPTY }; }
}

let score = load();

export const scoreboard = {
  get: () => score,
  /** @param {'player'|'jev'|'draw'} winner */
  record(winner, detail) {
    if (winner === 'player') score.player++;
    else if (winner === 'jev') score.jev++;
    else score.draws++;
    score.games = [{ winner, ...detail, at: Date.now() }, ...(score.games || [])].slice(0, 50);
    try { localStorage.setItem(KEY, JSON.stringify(score)); } catch {}
    return score;
  },
  reset() {
    score = { ...EMPTY, games: [] };
    try { localStorage.removeItem(KEY); } catch {}
    return score;
  },
};
