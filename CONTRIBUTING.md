# Contributing to JevChess

Thanks for being here! 🎉 JevChess is a community project, and we're glad you want to help. This guide gets you from zero to a merged pull request.

## Ground rules

- **Be kind.** Everyone was a beginner once. See the [Code of Conduct](CODE_OF_CONDUCT.md).
- **Small PRs are great.** One focused change is easier to review than five bundled together.
- **Ask early.** If you're planning something big, open an issue first so nobody duplicates work.
- **No question is too small.** Comment on an issue or open a draft PR and ask.

## Getting set up

You need **Node.js 20+**.

```bash
git clone <your-fork-url>
cd jevchess
npm install
npm run dev     # http://localhost:5173
npm test        # all tests should pass — no API key needed
```

**You don't need a TypeSafe API key** for most work. Without one, Jev's badge shows **LOCAL** and the built-in engine plays. To try the real TypeSafe Jev:

```bash
cp .env.example .env.local   # then set TYPESAFE_API_KEY=...
```

Never commit `.env.local` or paste a key into an issue or PR. The `.gitignore` already excludes env files.

## Where things live

| Path | What it is |
| --- | --- |
| `src/main.js` | Game controller and UI wiring |
| `src/scene/` | three.js: board, procedural pieces, lighting, animation, tap picking |
| `src/jev/typesafe.js` | Browser client for `/api/jev` and the difficulty policy |
| `src/jev/engine.js`, `board.js` | Local search engine (offline fallback and Legendary verifier) |
| `server/typesafe-jev.js` | Server bridge to TypeSafe Jev. **The only place the API key is used.** |
| `api/jev.js` | Vercel Function entry point |
| `test/` | `node:test` suites; the TypeSafe API is mocked |

## Making a change

1. **Fork** the repo and create a branch: `git checkout -b fix/knight-shadow`.
2. **Make your change.** Match the style of the surrounding code: plain modern JavaScript (ES modules), no framework, small comments where the *why* isn't obvious.
3. **Add or update tests** when you touch the engine, the server bridge, the policy or the scoreboard. Bug fixes should come with a test that fails without the fix.
4. **Run the checks:**
   ```bash
   npm test
   npm run build
   ```
5. **Try it on a phone-sized screen** if you changed anything visual. Your browser's device toolbar is fine.
6. **Commit** with a clear message ("Fix knight ears facing backwards for black").
7. **Open a pull request** and fill in the template. Screenshots or short clips are very welcome for visual changes.

## Guidelines by area

**Rules & engine**
- chess.js is the source of truth for rules. Don't reimplement rule checks in the UI.
- Changes to `board.js` must keep the perft tests passing. They are the safety net for move generation.
- When you change the evaluation or search, include a few before/after self-play results in the PR. `node` scripts in your PR description are fine.

**TypeSafe Jev**
- The API key must stay server-side. Never import `server/` from `src/`, and never give env vars a `VITE_` prefix.
- Validate everything that comes back. Only legal moves may ever be played.
- Keep the local-engine fallback working, so the game must still play with no key and no network.

**3D & UI**
- Mobile first: check portrait phones, landscape phones and desktop.
- Keep the frame rate smooth on mid-range phones. Be careful with shadow-map sizes, extra lights and per-frame allocations.
- No external asset downloads. Geometry and textures are generated in code, which keeps the project self-contained.

## Reporting bugs

Please include:
- what you did, what you expected, and what happened instead
- device, OS and browser
- whether Jev's badge showed **TYPESAFE** or **LOCAL**
- the move list, if it's about a game. Open the **Moves** panel and copy it.

## Your first contribution

Look for issues labelled **`good first issue`**. Some friendly starters:
- add a new board colour theme
- show the move number next to Jev's commentary
- add a "copy PGN" button to the moves panel
- write a test for something that isn't covered yet

Thank you for helping make JevChess better! ♞
