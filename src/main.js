import './style.css';
import { Chess } from 'chess.js';
import { World } from './scene/world.js';
import { LEVELS } from './jev/engine.js';
import { typesafeEnabled, askTypeSafeJev, applyPolicy, typesafeThought } from './jev/typesafe.js';
import { confetti } from './ui/confetti.js';
import { sound } from './ui/sound.js';
import { scoreboard } from './ui/score.js';
import { inject, track } from '@vercel/analytics';

// Vercel Web Analytics: page views, plus game events (custom events need a Pro plan).
inject({ mode: import.meta.env.PROD ? 'production' : 'development', debug: false });

const $ = (s) => document.querySelector(s);
const GLYPH = { w: { k: '♔', q: '♕', r: '♖', b: '♗', n: '♘', p: '♙' }, b: { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' } };
const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

document.querySelector('#app').innerHTML = `
  <div id="stage"></div>
  <header class="topbar">
    <div class="brand"><img class="logo" src="/favicon.svg" alt="" /><span>Jev<b>Chess</b></span></div>
    <button class="score-pill" id="scorePill" title="Session score">
      <span>You <b id="sYou">0</b></span><span class="sep">–</span><span><b id="sJev">0</b> Jev</span>
      <span class="draws">½ <b id="sDraw">0</b></span>
    </button>
    <a class="icon-btn" id="githubBtn" href="https://github.com/Odinachi/jevchess" target="_blank" rel="noopener" aria-label="JevChess on GitHub" title="Star JevChess on GitHub"><svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg></a>
    <button class="icon-btn" id="muteBtn" aria-label="Toggle sound">🔊</button>
  </header>

  <section class="player-card jev" id="jevCard">
    <div class="avatar">J</div>
    <div class="meta">
      <div class="name">Jev <span class="level" id="jevLevel">Pro</span><span class="source" id="jevSource"></span></div>
      <div class="captured" id="capJev"></div>
    </div>
    <div class="thought" id="thought">Ready when you are.</div>
  </section>

  <section class="player-card you" id="youCard">
    <div class="avatar you">You</div>
    <div class="meta">
      <div class="name">You <span class="turn-dot" id="turnDot"></span></div>
      <div class="captured" id="capYou"></div>
    </div>
  </section>

  <aside class="moves" id="movesPanel">
    <div class="moves-head">Moves <button class="icon-btn small" id="closeMoves" aria-label="Close">✕</button></div>
    <ol id="moveList"></ol>
  </aside>

  <nav class="toolbar">
    <button id="undoBtn"><span>↶</span>Undo</button>
    <button id="viewBtn"><span>⟲</span>View</button>
    <button id="movesBtn"><span>☰</span>Moves</button>
    <button id="resignBtn"><span>⚑</span>Resign</button>
    <button id="newBtn" class="primary"><span>＋</span>New</button>
  </nav>

  <div class="toast" id="toast"></div>

  <div class="modal" id="setupModal">
    <div class="card">
      <h1>Play Jev</h1>
      <p class="sub">A 3D chess duel against Jev's decision model.</p>
      <label class="group-label">Difficulty</label>
      <div class="seg" id="levelSeg">
        <button data-level="beginner"><b>Beginner</b><small>Learning the ropes</small></button>
        <button data-level="pro"><b>Pro</b><small>Club strength</small></button>
        <button data-level="legendary"><b>Legendary</b><small>Full power search</small></button>
      </div>
      <label class="group-label">Play as</label>
      <div class="seg colors" id="colorSeg">
        <button data-color="w"><span class="chip w">♔</span>White</button>
        <button data-color="r"><span class="chip r">?</span>Random</button>
        <button data-color="b"><span class="chip b">♚</span>Black</button>
      </div>
      <div class="score-box" id="setupScore"></div>
      <button class="cta" id="startBtn">Start game</button>
      <button class="link" id="resetScore">Reset score</button>
      <a class="github-cta" href="https://github.com/Odinachi/jevchess" target="_blank" rel="noopener"><svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg><span>Open source on GitHub — contributions welcome</span></a>
    </div>
  </div>

  <div class="modal" id="promoModal">
    <div class="card small">
      <h2>Promote to</h2>
      <div class="promo" id="promoChoices"></div>
    </div>
  </div>

  <div class="modal" id="overModal">
    <div class="card">
      <div class="result-icon" id="resultIcon">🏆</div>
      <h1 id="resultTitle">Checkmate</h1>
      <p class="sub" id="resultSub"></p>
      <div class="score-box big" id="overScore"></div>
      <button class="cta" id="againBtn">New game</button>
      <button class="link" id="reviewBtn">Review board</button>
    </div>
  </div>

  <div class="modal" id="confirmModal">
    <div class="card small">
      <h2>Resign this game?</h2>
      <p class="sub">Jev will be awarded the win.</p>
      <div class="row">
        <button class="ghost" id="cancelResign">Keep playing</button>
        <button class="cta danger" id="confirmResign">Resign</button>
      </div>
    </div>
  </div>
`;

// ---------- State ----------
const chess = new Chess();
const state = {
  player: 'w',
  level: localStorage.getItem('jevchess.level') || 'pro',
  colorChoice: localStorage.getItem('jevchess.color') || 'w',
  selected: null,
  busy: false,
  over: false,
  fens: [],
  thinkId: 0,
};

const world = new World($('#stage'), { onSquareTap });
// Local search engine: offline fallback, and the verifier for Legendary.
const worker = new Worker(new URL('./jev/worker.js', import.meta.url), { type: 'module' });
const pending = new Map();
worker.onmessage = ({ data }) => { pending.get(data.id)?.(data.result); pending.delete(data.id); };
let workerSeq = 0;
function localThink(payload) {
  const id = ++workerSeq;
  return new Promise((resolve) => { pending.set(id, resolve); worker.postMessage({ id, ...payload }); });
}
if (import.meta.env.DEV) window.__jev = { world, chess, state };

// ---------- Input ----------
function onSquareTap(sq) {
  sound.unlock();
  if (state.busy || state.over || chess.turn() !== state.player) return;
  const piece = chess.get(sq);
  if (state.selected) {
    const moves = chess.moves({ square: state.selected, verbose: true }).filter((m) => m.to === sq);
    if (moves.length) {
      if (moves.some((m) => m.promotion)) return askPromotion(moves[0]);
      return playMove({ from: moves[0].from, to: sq });
    }
  }
  if (piece && piece.color === state.player && sq !== state.selected) select(sq);
  else select(null);
}

function select(sq) {
  state.selected = sq;
  if (sq && navigator.vibrate) navigator.vibrate(8);
  refreshHighlights();
}

function refreshHighlights() {
  const hist = chess.history({ verbose: true });
  const last = hist[hist.length - 1];
  let check = null;
  if (chess.inCheck()) {
    for (const row of chess.board()) for (const p of row) if (p && p.type === 'k' && p.color === chess.turn()) check = p.square;
  }
  const targets = state.selected
    ? chess.moves({ square: state.selected, verbose: true }).map((m) => ({ sq: m.to, capture: !!m.captured }))
    : [];
  world.setHighlights({ selected: state.selected, targets: dedupe(targets), lastMove: last ? [last.from, last.to] : null, check });
}

const dedupe = (arr) => arr.filter((t, i) => arr.findIndex((x) => x.sq === t.sq) === i);

function askPromotion(move) {
  const box = $('#promoChoices');
  box.innerHTML = '';
  for (const t of ['q', 'r', 'b', 'n']) {
    const b = document.createElement('button');
    b.textContent = GLYPH[state.player][t];
    b.onclick = () => { hide('#promoModal'); playMove({ from: move.from, to: move.to, promotion: t }); };
    box.appendChild(b);
  }
  show('#promoModal');
}

// ---------- Moves ----------
async function playMove(mv) {
  state.fens.push(chess.fen());
  const m = chess.move(mv);
  state.selected = null;
  state.busy = true;
  world.setHighlights({ lastMove: [m.from, m.to] });
  const token = state.thinkId;
  await world.animateMove(m);
  if (token !== state.thinkId) return; // undone or new game while the piece was moving
  afterMove(m);
  if (!checkGameOver()) askJev();
}

function afterMove(m) {
  if (chess.inCheck()) sound.check();
  else if (m.captured) sound.capture();
  else sound.move();
  refreshHighlights();
  renderPanels();
}

async function askJev() {
  state.busy = true;
  const id = ++state.thinkId;
  setThinking(true);
  const t0 = performance.now();
  const fen = chess.fen();
  const history = chess.history();
  const local = { fen, history, level: state.level, past: state.fens.slice(-40) };

  let result;
  if (await typesafeEnabled()) {
    try {
      const data = await askTypeSafeJev(fen, history);
      if (id !== state.thinkId) return;
      const { pick, candidates } = applyPolicy(data.ranked, state.level);
      let chosen = pick;
      let note = `TypeSafe ${data.model || 'Jev'} · ${data.ms} ms`;
      if (candidates) {
        const verified = await localThink({ ...local, candidates });
        chosen = data.ranked.find((m) => verified && m.from === verified.move.from && m.to === verified.move.to && (m.promotion || undefined) === (verified.move.promotion || undefined)) || pick;
        note += ` · ${candidates.length} candidates verified`;
      }
      result = {
        move: { from: chosen.from, to: chosen.to, promotion: chosen.promotion },
        thought: typesafeThought(chosen, data),
        note,
        source: 'typesafe',
      };
    } catch (e) {
      console.warn('[jev] TypeSafe Jev unavailable, using local engine:', e);
      toast('TypeSafe Jev unreachable — local engine is playing');
    }
  }
  if (!result) {
    const r = await localThink(local);
    if (!r) return;
    const stats = r.book ? 'opening book' : r.depth ? `depth ${r.depth} · ${fmt(r.nodes)} positions` : '';
    result = { move: r.move, thought: r.thought, note: `Local engine${stats ? ' · ' + stats : ''}`, source: 'local' };
  }
  if (id !== state.thinkId || state.over) return;
  setSource(result.source);

  // Don't move instantly — feel like a person across the board.
  const wait = 600 - (performance.now() - t0);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  if (id !== state.thinkId) return;

  state.fens.push(chess.fen());
  const m = chess.move(result.move);
  setThinking(false, result);
  await world.animateMove(m);
  afterMove(m);
  state.busy = false;
  checkGameOver();
}

function setSource(src) {
  const el = $('#jevSource');
  el.textContent = src === 'typesafe' ? 'TypeSafe' : 'Local';
  el.dataset.src = src;
  el.title = src === 'typesafe' ? 'Moves chosen by TypeSafe Jev' : 'TypeSafe Jev not configured — local engine fallback';
}

function setThinking(on, result) {
  $('#jevCard').classList.toggle('thinking', on);
  const t = $('#thought');
  if (on) t.innerHTML = '<span class="dots"><i></i><i></i><i></i></span>';
  else if (result) {
    t.innerHTML = `${escapeHtml(result.thought)}${result.note ? `<small>${escapeHtml(result.note)}</small>` : ''}`;
  }
}

const fmt = (n) => (n > 1e6 ? (n / 1e6).toFixed(1) + 'M' : n > 1e3 ? Math.round(n / 1e3) + 'k' : String(n));
const escapeHtml = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// ---------- Game over & score ----------
function checkGameOver() {
  if (!chess.isGameOver()) return false;
  state.over = true;
  state.busy = false;
  let winner = 'draw', title = 'Draw', sub = '', icon = '🤝';
  if (chess.isCheckmate()) {
    const loser = chess.turn();
    winner = loser === state.player ? 'jev' : 'player';
    title = 'Checkmate!';
    sub = winner === 'player' ? 'You beat Jev. Brilliant.' : 'Jev delivers mate. Rematch?';
    icon = winner === 'player' ? '🏆' : '♚';
  } else if (chess.isStalemate()) sub = 'Stalemate — no legal moves.';
  else if (chess.isThreefoldRepetition()) sub = 'Threefold repetition.';
  else if (chess.isInsufficientMaterial()) sub = 'Insufficient material.';
  else sub = '50-move rule.';
  finish(winner, title, sub, icon, chess.isCheckmate());
  return true;
}

function finish(winner, title, sub, icon, mate) {
  state.over = true;
  state.thinkId++;
  scoreboard.record(winner, { level: state.level, color: state.player, moves: chess.history().length });
  track('game_end', { result: winner, reason: mate ? 'checkmate' : title, level: state.level, moves: chess.history().length });
  renderScore();
  sound.end();
  $('#resultIcon').textContent = icon;
  $('#resultTitle').textContent = title;
  $('#resultSub').textContent = sub;
  $('#overModal').dataset.winner = winner;
  setTimeout(() => {
    if (mate) confetti();
    show('#overModal');
  }, mate ? 700 : 400);
}

function renderScore() {
  const s = scoreboard.get();
  $('#sYou').textContent = s.player;
  $('#sJev').textContent = s.jev;
  $('#sDraw').textContent = s.draws;
  const box = `
    <div class="sb"><span>You</span><b>${s.player}</b></div>
    <div class="sb mid"><span>Draws</span><b>${s.draws}</b></div>
    <div class="sb"><span>Jev</span><b>${s.jev}</b></div>`;
  $('#overScore').innerHTML = box;
  $('#setupScore').innerHTML = s.player + s.jev + s.draws ? box : '';
}

// ---------- Panels ----------
function renderPanels() {
  const hist = chess.history({ verbose: true });
  const list = $('#moveList');
  list.innerHTML = '';
  for (let i = 0; i < hist.length; i += 2) {
    const li = document.createElement('li');
    li.innerHTML = `<span>${hist[i].san}</span><span>${hist[i + 1]?.san || ''}</span>`;
    list.appendChild(li);
  }
  list.scrollTop = list.scrollHeight;

  // Captured pieces & material balance
  const lost = { w: [], b: [] };
  for (const m of hist) if (m.captured) lost[m.color === 'w' ? 'b' : 'w'].push(m.captured);
  const jev = state.player === 'w' ? 'b' : 'w';
  const mat = (c) => lost[c].reduce((a, t) => a + VALUE[t], 0);
  const diff = mat(jev) - mat(state.player);
  const fmtCap = (c, adv) => {
    const order = 'qrbnp';
    const s = lost[c].sort((a, b) => order.indexOf(a) - order.indexOf(b)).map((t) => GLYPH[c][t]).join('');
    return `<span class="glyphs">${s}</span>${adv > 0 ? `<em>+${adv}</em>` : ''}`;
  };
  $('#capYou').innerHTML = fmtCap(jev, diff);
  $('#capJev').innerHTML = fmtCap(state.player, -diff);

  const yourTurn = chess.turn() === state.player && !state.over;
  $('#youCard').classList.toggle('active', yourTurn);
  $('#jevCard').classList.toggle('active', !yourTurn && !state.over);
  $('#undoBtn').disabled = state.over || hist.length < (state.player === 'w' ? 1 : 2);
  $('#resignBtn').disabled = state.over || hist.length < 1;
}

// ---------- Game lifecycle ----------
function newGame() {
  hide('#setupModal'); hide('#overModal');
  const choice = state.colorChoice;
  state.player = choice === 'r' ? (Math.random() < 0.5 ? 'w' : 'b') : choice;
  track('game_start', { level: state.level, color: state.player });
  chess.reset();
  state.selected = null;
  state.over = false;
  state.busy = false;
  state.fens = [];
  state.thinkId++;
  world.setPosition(chess.board());
  world.setCaptured([]);
  world.setOrientation(state.player);
  world.board.flipLabels(state.player === 'b');
  $('#jevLevel').textContent = LEVELS[state.level].name;
  $('#jevLevel').dataset.level = state.level;
  $('#jevCard').classList.remove('thinking');
  $('#thought').textContent = state.player === 'w' ? 'Your move. Good luck.' : 'I have white. Let’s begin.';
  refreshHighlights();
  renderPanels();
  if (state.player === 'b') askJev();
}

function undo() {
  if (state.over) return;
  state.thinkId++; // discard any pending Jev reply
  setThinking(false);
  // Take back to the player's previous turn.
  do { chess.undo(); state.fens.pop(); } while (chess.turn() !== state.player && chess.history().length);
  state.busy = false;
  state.selected = null;
  world.setPosition(chess.board());
  world.setCaptured(chess.history({ verbose: true }).filter((m) => m.captured).map((m) => ({ type: m.captured, color: m.color === 'w' ? 'b' : 'w' })));
  $('#thought').textContent = 'Taking that back? Fine.';
  refreshHighlights();
  renderPanels();
  if (chess.turn() !== state.player) askJev();
}

function openSetup() {
  for (const b of document.querySelectorAll('#levelSeg button')) b.classList.toggle('on', b.dataset.level === state.level);
  for (const b of document.querySelectorAll('#colorSeg button')) b.classList.toggle('on', b.dataset.color === state.colorChoice);
  renderScore();
  show('#setupModal');
}

// ---------- Modals & toolbar ----------
function show(id) { $(id).classList.add('open'); }
function hide(id) { $(id).classList.remove('open'); }
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove('show'), 1800);
}

$('#levelSeg').onclick = (e) => {
  const b = e.target.closest('button'); if (!b) return;
  state.level = b.dataset.level;
  localStorage.setItem('jevchess.level', state.level);
  openSetup();
};
$('#colorSeg').onclick = (e) => {
  const b = e.target.closest('button'); if (!b) return;
  state.colorChoice = b.dataset.color;
  localStorage.setItem('jevchess.color', state.colorChoice);
  openSetup();
};
$('#startBtn').onclick = () => { sound.unlock(); newGame(); };
$('#resetScore').onclick = () => { scoreboard.reset(); renderScore(); toast('Score reset'); };
$('#againBtn').onclick = () => { hide('#overModal'); openSetup(); };
$('#reviewBtn').onclick = () => hide('#overModal');
$('#newBtn').onclick = openSetup;
$('#scorePill').onclick = openSetup;
$('#undoBtn').onclick = undo;
$('#viewBtn').onclick = () => world.resetView();
$('#movesBtn').onclick = () => $('#movesPanel').classList.toggle('open');
$('#closeMoves').onclick = () => $('#movesPanel').classList.remove('open');
$('#resignBtn').onclick = () => show('#confirmModal');
$('#cancelResign').onclick = () => hide('#confirmModal');
$('#confirmResign').onclick = () => {
  hide('#confirmModal');
  finish('jev', 'You resigned', 'Jev takes the point. Go again?', '🏳️', false);
  renderPanels();
};
$('#muteBtn').textContent = sound.muted ? '🔇' : '🔊';
$('#muteBtn').onclick = () => { $('#muteBtn').textContent = sound.toggle() ? '🔇' : '🔊'; };
for (const m of document.querySelectorAll('.modal')) {
  m.addEventListener('click', (e) => {
    if (e.target === m && m.id !== 'promoModal' && m.id !== 'setupModal') hide('#' + m.id);
    if (e.target === m && m.id === 'setupModal' && chess.history().length) hide('#setupModal');
  });
}

// Boot
typesafeEnabled().then((on) => setSource(on ? 'typesafe' : 'local'));
world.setPosition(chess.board());
renderScore();
renderPanels();
refreshHighlights();
openSetup();
