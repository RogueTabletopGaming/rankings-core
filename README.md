# 🏆 rankings-core

A zero-dependency TypeScript library to compute and manage **tournament standings**, **pairings**, and **ratings** — supporting both **Swiss** and **Round‑Robin** formats — with modern tie‑breakers such as **Buchholz (OMW%)**, **Game Win % (GWP)**, **Opponent Game Win % (OGWP)**, and **Sonneborn–Berger (SB)**.  
Includes **ELO rating updates** for leagues and persistent skill tracking, plus an optional **WebAssembly (WASM)** build for ultra‑fast browser use.

---

## ✨ Features

- 🧮 **Standings**
  - Swiss & Round‑Robin modes
  - Head‑to‑head resolving inside tie blocks
  - Sonneborn–Berger (SB), OMW%, GWP, OGWP
  - Deterministic seed‑based fallback ordering
  - BYEs, forfeits, and penalties handled correctly
  - `acceptSingleEntryMatches` for lenient ingestion (auto‑mirrors missing results)

- 🤝 **Pairings**
  - Swiss pairing generator (avoids rematches, assigns/rotates byes, light backtracking)
  - Round‑robin schedule generator (supports odd/even players, stable byes)
  - Generic `generatePairings({ mode })` facade to route between strategies

- 📈 **Ratings**
  - ELO updates (sequential & simultaneous batch modes)
  - Custom K, KDraw, per‑player K, caps/floors, and `drawScore`

- ⚙️ **Engineering**
  - 100% TypeScript, zero runtime deps
  - Comprehensive Vitest coverage
  - Optional WebAssembly target for in‑browser speedups

---

## 📦 Installation

```bash
npm install rankings-core
# or
yarn add rankings-core
```

---

## 🧩 Unified Standings API

Both Swiss and Round‑Robin standings are computed via a **single entrypoint**.

### Example (Swiss)

```ts
import { computeStandings, MatchResult } from "rankings-core";

const matches = [
  { id: "r1-a", round: 1, playerId: "A", opponentId: "B", result: MatchResult.WIN, gameWins: 2, gameLosses: 0, gameDraws: 0 },
  { id: "r1-b", round: 1, playerId: "B", opponentId: "A", result: MatchResult.LOSS, gameWins: 0, gameLosses: 2, gameDraws: 0 },
  { id: "r1-c", round: 1, playerId: "C", opponentId: null, result: MatchResult.BYE },
];

const swiss = computeStandings({
  mode: "swiss",
  matches,
  options: { eventId: "SWISS-DEMO" },
});

console.table(
  swiss.map(r => ({
    Rank: r.rank,
    Player: r.playerId,
    MP: r.matchPoints,
    OMW: r.omwp.toFixed(3),
    GWP: r.gwp.toFixed(3),
    OGWP: r.ogwp.toFixed(3),
    SB: r.sb.toFixed(1),
  }))
);
```

### Example (Round‑Robin, with single‑entry ingestion)

```ts
import { computeStandings, MatchResult } from "rankings-core";

const matches = [
  // Only one entry per played match; the mirror is *omitted* on purpose.
  { id: "m1-a", round: 1, playerId: "A", opponentId: "B", result: MatchResult.WIN, gameWins: 2, gameLosses: 0 },
  { id: "m2-a", round: 1, playerId: "C", opponentId: "A", result: MatchResult.WIN, gameWins: 2, gameLosses: 0 },
];

const rr = computeStandings({
  mode: "roundrobin",
  matches,
  options: {
    eventId: "RR-DEMO",
    acceptSingleEntryMatches: true, // ✅ missing mirrors auto‑generated
  },
});

console.table(rr);
```

### `computeStandings` options

```ts
interface ComputeStandingsRequest {
  mode: "swiss" | "roundrobin";
  matches: Match[];
  options?: {
    eventId?: string;                    // deterministic seed for tie fallback
    applyHeadToHead?: boolean;           // default true
    tiebreakFloors?: { opponentPctFloor?: number }; // default 0.33
    points?: { win?: number; draw?: number; loss?: number; bye?: number }; // default 3/1/0/3
    acceptSingleEntryMatches?: boolean;  // RR & Swiss both support this
  };
}
```

---

## ♻️ Pairings

Use the facade to generate either Swiss or Round‑Robin pairings.

### Swiss Pairings

```ts
import { generatePairings } from "rankings-core";

const standings = [
  { playerId: "A", matchPoints: 9, rank: 1, opponents: [] },
  { playerId: "B", matchPoints: 9, rank: 2, opponents: [] },
  { playerId: "C", matchPoints: 6, rank: 3, opponents: [] },
  { playerId: "D", matchPoints: 6, rank: 4, opponents: [] },
  { playerId: "E", matchPoints: 3, rank: 5, opponents: [] },
];

const result = generatePairings({
  mode: "swiss",
  standings,
  history: [],
  options: { eventId: "ROUND-3", protectTopN: 2 }
});

console.log(result);
/*
{
  pairings: [ {a:"A", b:"B"}, {a:"C", b:"D"} ],
  bye: "E",
  downfloats: {...},
  rematchesUsed: []
}
*/
```

### Round‑Robin Pairings (schedule)

```ts
import { generatePairings } from "rankings-core";

const result = generatePairings({
  mode: "roundrobin",
  players: ["A", "B", "C", "D", "E"],
  roundNumber: 2,
});

console.log(result);
/*
{
  pairings: [ {a:"A", b:"C"}, {a:"B", b:"D"} ],
  byes: ["E"]
}
*/
```

Or build all rounds up‑front:

```ts
import { buildRoundRobinSchedule } from "rankings-core";

const rounds = buildRoundRobinSchedule(["A","B","C","D"]);
/*
[
  { round: 1, pairings: [{a:"A",b:"B"},{a:"C",b:"D"}] },
  { round: 2, pairings: [{a:"A",b:"C"},{a:"B",b:"D"}] },
  { round: 3, pairings: [{a:"A",b:"D"},{a:"B",b:"C"}] }
]
*/
```

---

## 📊 Ratings (ELO)

```ts
import { updateEloRatings } from "rankings-core";

const base = { Alice: 1500, Bob: 1500 };
const matches = [{ a: "Alice", b: "Bob", result: "A" }];

const { ratings } = updateEloRatings(base, matches, { K: 32 });
// -> { Alice: 1516, Bob: 1484 }
```

Advanced options:

```ts
interface EloOptions {
  K?: number;                         // base K (default 32)
  KDraw?: number;                     // K used on draws (default = K)
  perPlayerK?: Record<string, number>;
  drawScore?: number;                 // default 0.5 (e.g., 0.6 for near‑wins)
  floor?: number; cap?: number;       // rating bounds
  initialRating?: number;             // unseen players (default 1500)
  mode?: "sequential" | "simultaneous";
}
```

---

## ⚡ WebAssembly (Optional)

A separate **WASM build** is available for browser runtimes that need maximum performance with large tournaments.

### When to use WASM
- Heavy client‑side workloads (e.g., 1,000+ players × many rounds)
- Deterministic, fast re‑ranking after each round in a browser
- Mobile devices with weaker JS engines

### Build
This repo ships with an `assemblyscript` setup under `/wasm`. Typical scripts:

```bash
# 1) Install local AssemblyScript toolchain
npm i -D assemblyscript

# 2) Build the wasm binary (writes to dist/ratings.wasm in this example)
npm run wasm:build

# 3) (Optional) copy to a static folder your app can serve
npm run wasm:copy
```

> If you see `Could not find module 'tslib'` during Rollup or bundling, add `npm i -D tslib` to your project.

### Load in a Browser (example)

```ts
// ratings-wasm-bridge.ts (example consumer app code)
let wasm: WebAssembly.WebAssemblyInstantiatedSource | null = null;

export async function initRatingsWasm(url = "/ratings.wasm") {
  const res = await fetch(url);
  const bytes = await res.arrayBuffer();
  wasm = await WebAssembly.instantiate(bytes, { /* imports if any */ });
}

export function expectedScoreWasm(rA: number, rB: number): number {
  if (!wasm) throw new Error("WASM not initialized. Call initRatingsWasm() first.");
  // assumes your AssemblyScript export name is 'expectedScore'
  // @ts-ignore - depends on your actual bindings shape
  return wasm.instance.exports.expectedScore(rA, rB) as number;
}
```

### Fallback Strategy
Keep your TypeScript implementations as the default. At runtime, try to initialize WASM and *feature‑detect* it:

```ts
let useWasm = false;
initRatingsWasm().then(() => { useWasm = true; }).catch(() => { useWasm = false; });

export function expectedScore(rA: number, rB: number): number {
  return useWasm ? expectedScoreWasm(rA, rB) : 1 / (1 + Math.pow(10, (rB - rA) / 400));
}
```

> Tip: keep **all** existing TS functions (standings, pairings, ratings) intact. Introduce small per‑feature “bridges” that *optionally* call into WASM if available. This avoids big refactors and keeps Node/server users happy.

---

## 🧪 Testing

Everything is covered by **Vitest**:

| Module  | Coverage highlights |
|---------|---------------------|
| Standings | Swiss + Round‑Robin, tie‑breakers, BYEs, penalties, single‑entry ingestion |
| Pairings  | Swiss pairing rules, rematch avoidance, backtracking, RR schedules |
| Ratings   | ELO updates, draws, per‑player K, floors, caps, modes |
| Core      | Determinism, immutability, snapshot stability |

Run locally:

```bash
npm test
# or
npx vitest run --coverage
```

---

## 🗺️ Roadmap

- [x] Round‑Robin standings & schedules  
- [x] Unified `computeStandings()` dispatcher  
- [x] `acceptSingleEntryMatches` (lenient ingestion)  
- [x] Optional WebAssembly build for browsers  
- [ ] Glicko‑2 rating system  
- [ ] Single‑elimination pairings  
- [ ] JSON schema validation  

---

## 📜 License

MIT © 2025 — `rankings-core` authors
