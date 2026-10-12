# JevChess ♞

Realistic, mobile-friendly **3D chess in the browser** — play against **Jev**, a chess decision model that runs entirely on your device.

- 🎲 **Three difficulties per game:** Beginner, Pro, Legendary
- ♟️ **Standard chess rules** — castling, en passant, promotion, check/checkmate, stalemate, threefold repetition, 50‑move rule, insufficient material
- 🪵 **Realistic 3D set** — procedurally turned Staunton pieces, hand‑painted wood board, soft shadows, PBR lighting
- 📱 **Mobile first** — tap to move, drag to orbit, pinch to zoom, safe‑area aware layout, haptics
- 🏆 **Session score** — You vs Jev (plus draws) is tallied across games and survives reloads
- 🎉 **Confetti on checkmate**, synthesized wooden move sounds, undo, resign, move list

No servers, no accounts, no assets to download — everything is generated in code.

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # engine tests (perft + tactics)
npm run build      # static build in dist/
```

The build is a static site — deploy `dist/` to any static host (Vercel, Netlify, GitHub Pages, …).

## How Jev thinks

Jev lives in [`src/jev/`](src/jev) and runs in a Web Worker so the UI never freezes.

| Part | What it does |
| --- | --- |
| `board.js` | Fast 0x88 board with make/unmake and Zobrist hashing (perft‑verified, ~1–5M nodes/s) |
| `engine.js` | Evaluation (material, piece‑square tables, tapered king safety, bishop pair, pawn structure) and search: iterative deepening alpha‑beta with PVS, transposition table, null‑move pruning, late‑move reductions, quiescence, MVV‑LVA / killer / history move ordering, repetition detection, small opening book |
| `worker.js` | Thin worker wrapper |

Difficulty is a mix of search depth/time and "human" variety:

| Level | Search | Style |
| --- | --- | --- |
| Beginner | 1 ply + quiescence | Picks loosely among decent moves, sometimes plays on a hunch |
| Pro | up to 5 plies, ~0.9 s | Small variety among near‑best moves, uses the opening book |
| Legendary | iterative deepening, ~3 s | Always plays its best move |

[chess.js](https://github.com/jhlywa/chess.js) is the source of truth for game rules and notation; Jev's own board is only used for speed inside the search.

## Project layout

```
src/
  main.js          game controller + UI
  style.css
  jev/             the Jev decision model (engine, fast board, worker)
  scene/           three.js world: board, pieces, lighting, animation, picking
  ui/              confetti, sound, scoreboard
test/              node:test engine tests
```

## Contributing

PRs welcome! Please run `npm test` before submitting. Ideas: piece set themes, drag‑to‑move, PGN export, stronger evaluation, an opening explorer.

## License

[MIT](LICENSE)
