# JevChess ♞

Realistic, mobile-friendly **3D chess in the browser** — play against **[TypeSafe Jev](https://typesafe.ai/blog/introducing-system-one-models-and-jev)**, TypeSafe's System One decision model, with a built-in local engine as an offline fallback.

- 🎲 **Three difficulties per game:** Beginner, Pro, Legendary
- ♟️ **Standard chess rules** — castling, en passant, promotion, check/checkmate, stalemate, threefold repetition, 50‑move rule, insufficient material
- 🪵 **Realistic 3D set** — procedurally turned Staunton pieces, hand‑painted wood board, soft shadows, PBR lighting
- 📱 **Mobile first** — tap to move, drag to orbit, pinch to zoom, safe‑area aware layout, haptics
- 🏆 **Session score** — You vs Jev (plus draws) is tallied across games and survives reloads
- 🎉 **Confetti on checkmate**, synthesized wooden move sounds, undo, resign, move list

All 3D assets are generated in code — nothing to download.

> **New here? You're welcome to contribute!** Whether it's your first open-source PR or your hundredth, there's a place for you. Jump to [Contributing](#contributing) 👋

## Quick start

```bash
npm install
cp .env.example .env.local   # add your TYPESAFE_API_KEY (optional)
npm run dev                  # http://localhost:5173
npm test                     # 82 tests, no API key or network needed
npm run build
```

Without a key the game still works: Jev's badge shows **LOCAL** and the built-in engine plays. With a key it shows **TYPESAFE**.

## TypeSafe Jev integration

```
browser ──POST /api/jev {fen, history}──▶ server/typesafe-jev.js ──@typesafe-ai/sdk──▶ api.typesafe.ai/v1/systemone
        ◀── ranked moves + confidence ──
```

- **The API key stays on the server.** `/api/jev` is a Vercel Function ([`api/jev.js`](api/jev.js)) in production and Vite middleware in dev ([`vite.config.js`](vite.config.js)). Both share [`server/typesafe-jev.js`](server/typesafe-jev.js).
- Each turn sends one System One request. The `state` holds the FEN, an ASCII board, a piece list, material, recent moves, and whether the side to move is in check. It asks two typed questions, evaluated in parallel:
  - `move`: a **`choice`** whose options are *every legal move*. Labels are UCI (`e2e4`), and each description reads like `"Nf3: knight g1 to f3, gives check"`. Chess never exceeds 218 legal moves, which fits within Jev's 255-option limit.
  - `assessment`: a **`score`** from 0 to 4 rating who is better. It drives Jev's commentary.
- The server validates the FEN with chess.js and drops any label that isn't a legal move. The page also checks the move before playing it.
- A simple per-IP rate limit protects the key on public deployments.

Difficulty is applied to Jev's probability distribution ([`src/jev/typesafe.js`](src/jev/typesafe.js)):

| Level | Policy |
| --- | --- |
| Beginner | Samples from Jev's top moves with a high temperature (flattened distribution) |
| Pro | Plays Jev's top `choice` |
| Legendary | Shortlists Jev's most probable moves, plus any mate. The local search verifies the shortlist and plays the best move from it. This follows the [confidence-gated routing](https://docs.typesafe.ai/patterns/confidence-routing) pattern. |

If the API is unreachable or times out, the game falls back to the local engine and shows a notice.

### Deploying

Deploy to Vercel, then set `TYPESAFE_API_KEY` in the project's environment variables (for example with `vercel env add TYPESAFE_API_KEY`). Other hosts need to serve `POST /api/jev` with `server/typesafe-jev.js`.

- **Analytics:** Vercel Web Analytics is built in. Enable it under **Analytics** in the Vercel dashboard. It records page views, plus `game_start` / `game_end` custom events, which need a Pro plan.
- **Social previews:** the Open Graph and Twitter cards need absolute URLs, which are filled in at build time. On Vercel they're detected automatically. Set `SITE_URL` if you use a custom domain.

## Brand images

The favicon (`public/favicon.svg`) is the source of truth. `npm run images` regenerates the PNG app icons and the 1200×630 social card (`public/og-image.jpg`) from code in [`scripts/generate-images.mjs`](scripts/generate-images.mjs).

## Local engine (fallback & verifier)

It lives in [`src/jev/`](src/jev) and runs in a Web Worker so the UI never freezes.

| Part | What it does |
| --- | --- |
| `board.js` | Fast 0x88 board with make/unmake and Zobrist hashing (perft‑verified, ~1–5M nodes/s) |
| `engine.js` | Evaluation (material, piece‑square tables, tapered king safety, bishop pair, pawn structure) and search: iterative deepening alpha‑beta with PVS, transposition table, null‑move pruning, late‑move reductions, quiescence, MVV‑LVA / killer / history move ordering, repetition detection, small opening book |
| `worker.js` | Thin worker wrapper |
| `typesafe.js` | Browser client for `/api/jev` and the difficulty policy |

When it plays on its own (no key), difficulty is a mix of search depth/time and "human" variety:

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
  jev/             TypeSafe Jev client + local engine (fast board, worker)
  scene/           three.js world: board, pieces, lighting, animation, picking
  ui/              confetti, sound, scoreboard
public/            favicon, app icons, web manifest, social card
scripts/           image generator (npm run images)
server/            TypeSafe Jev bridge (holds the API key)
api/               Vercel Function entry (/api/jev)
test/              node:test suites (see below)
```

## Tests

`npm test` runs everything with Node's built-in test runner. The TypeSafe API is mocked, so the suite needs no API key, network or browser.

| Suite | Covers |
| --- | --- |
| `engine.test.js` | Perft move-generation counts on 5 standard positions, plus mate finding |
| `engine-edge.test.js` | Make/unmake + hash round-trips, castling through/out of check, pinned en passant, mate vs stalemate, only-move positions, repetition draws, shortlist verification |
| `server.test.js` | Missing key, bad input, mated/stalemated positions, check evasions, special-move descriptions, the 218-move position, hallucinated or partial answers, upstream errors and retries, rate limiting |
| `client.test.js` | Difficulty policies at the edges, commentary text, `/api/jev` client errors and timeouts |
| `score.test.js` | Score persistence, history cap, corrupted data, private-mode storage |
| `typesafe.test.js` | End-to-end request shape sent to TypeSafe |

## Contributing

**Contributions of every size are welcome**, from fixing a typo to tuning Jev's chess strength. If you're new to open source, this is a friendly place to start. Nobody expects a perfect first PR, and maintainers are happy to help you get it over the line.

1. Read **[CONTRIBUTING.md](CONTRIBUTING.md)**. It takes about 2 minutes.
2. Pick something: look for issues labelled **`good first issue`** or **`help wanted`**, or try one of the ideas below.
3. Fork, branch, `npm install`, and `npm test`. You don't need a TypeSafe key to work on anything except live TypeSafe calls.
4. Open a pull request. Draft PRs and questions are welcome too.

**Ideas we'd love help with**

| Area | Ideas |
| --- | --- |
| 🎨 3D & visuals | Alternative piece sets and board themes, a better knight model, a captured-piece tray, reduced-motion mode |
| 🕹️ Gameplay | Drag-to-move, premoves, move clocks, PGN import/export, a hint button, replay mode |
| 🧠 Jev | Better `state` prompts for TypeSafe Jev, smarter difficulty policies, a stronger local evaluation, opening book growth |
| ♿ Accessibility | Keyboard play, screen-reader move announcements, colour-blind highlights |
| 🌍 Everything else | Translations, docs, tests, performance on low-end phones |

Found a bug or have an idea? [Open an issue](../../issues/new/choose). Please follow our [Code of Conduct](CODE_OF_CONDUCT.md).

## License

[MIT](LICENSE)
