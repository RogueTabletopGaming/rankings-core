# 🏆 rankings-core

A zero-dependency TypeScript library to compute and manage **tournament standings**, **pairings**, and **ratings** — supporting **Swiss**, **Round-Robin**, and **Single Elimination** formats — with modern tie-breakers such as **Buchholz (OMW%)**, **Game Win % (GWP)**, **Opponent Game Win % (OGWP)**, and **Sonneborn–Berger (SB)**.  
Includes **ELO rating updates** for leagues and persistent skill tracking, plus an optional **WebAssembly (WASM)** build for ultra-fast browser use.

---

## ✨ Features

- 🧮 **Standings**
  - Swiss · Round-Robin · Single Elimination modes
  - Head-to-head resolving inside tie blocks (Swiss & RR)
  - Sonneborn–Berger (SB), OMW%, GWP, OGWP
  - Deterministic seed-based fallback ordering
  - BYEs, forfeits, penalties, and *double-losses* handled correctly
  - `acceptSingleEntryMatches` for lenient ingestion (auto-mirrors missing results)
  - `eliminationRound` field for Single Elimination to indicate round reached
  - **NEW:** Optional *Virtual Bye Player* for Swiss tie-breakers — include BYE rounds in OMW%/OGWP calculations as if played vs a fixed virtual opponent

- 🤝 **Pairings**
  - Swiss pairing generator (avoids rematches, assigns/rotates byes, light backtracking)
  - Round-Robin schedule generator (supports odd/even players, stable byes)
  - **Single Elimination pairing generator (new)** — build a bracket from seeds, surface R1 BYEs, and retrieve per-round pairings via the facade
  - Generic `generatePairings({ mode })` facade to route between strategies

- 📈 **Ratings**
  - ELO updates (sequential & simultaneous batch modes)
  - Custom K, KDraw, per-player K, caps/floors, and `drawScore`

- ⚙️ **Engineering**
  - 100% TypeScript, zero runtime deps
  - Comprehensive Vitest coverage
  - Optional WebAssembly target for in-browser speedups

---

## 📦 Installation

```bash
npm install rankings-core
# or
yarn add rankings-core
```

---

## 🧩 Unified Standings API

All tournament formats — **Swiss**, **Round-Robin**, and **Single Elimination** — are computed via a single entrypoint.

### Example (Swiss with Virtual Bye Player)

```ts
import { computeStandings, MatchResult } from "rankings-core";

const matches = [
  { id: "r1-a", round: 1, playerId: "A", opponentId: null, result: MatchResult.BYE },
  { id: "r1-b", round: 1, playerId: "B", opponentId: "C", result: MatchResult.WIN },
  { id: "r1-c", round: 1, playerId: "C", opponentId: "B", result: MatchResult.LOSS },
  { id: "r2-a", round: 2, playerId: "A", opponentId: "B", result: MatchResult.WIN },
  { id: "r2-b", round: 2, playerId: "B", opponentId: "A", result: MatchResult.LOSS },
];

// Enable the virtual-bye feature (optional)
const swiss = computeStandings({
  mode: "swiss",
  matches,
  options: {
    eventId: "SWISS-VIRTUAL",
    tiebreakVirtualBye: { enabled: true, mwp: 0.5, gwp: 0.5 },
  },
});

console.table(
  swiss.map(r => ({
    Rank: r.rank,
    Player: r.playerId,
    MP: r.matchPoints,
    OMW: r.omwp.toFixed(3),
    OGWP: r.ogwp.toFixed(3),
    GWP: r.gwp.toFixed(3),
  }))
);
```

**Explanation:**  
When `tiebreakVirtualBye.enabled` is `true`, any BYE a player receives contributes a synthetic entry to their OMW%/OGWP calculation.  
The virtual opponent is *not* shown in results or standings but affects tie-break math as if it had a fixed record.

- Default `mwp` = `0.5` → counts as a draw-like opponent.  
- Respects `tiebreakFloors` (e.g., `opponentPctFloor = 0.33`).  
- Multiple BYEs add multiple virtual entries.

---

### Example (Round-Robin, with single-entry ingestion)

```ts
import { computeStandings, MatchResult } from "rankings-core";

const matches = [
  { id: "m1-a", round: 1, playerId: "A", opponentId: "B", result: MatchResult.WIN, gameWins: 2, gameLosses: 0 },
  { id: "m2-a", round: 1, playerId: "C", opponentId: "A", result: MatchResult.WIN, gameWins: 2, gameLosses: 0 },
];

const rr = computeStandings({
  mode: "roundrobin",
  matches,
  options: {
    eventId: "RR-DEMO",
    acceptSingleEntryMatches: true,
  },
});

console.table(rr);
```

---

### Example (Single Elimination)

```ts
import { computeStandings, MatchResult } from "rankings-core";

const matches = [
  { id: "sf1-a", round: 1, playerId: "A", opponentId: "B", result: MatchResult.WIN },
  { id: "sf1-b", round: 1, playerId: "B", opponentId: "A", result: MatchResult.LOSS },
  { id: "sf2-c", round: 1, playerId: "C", opponentId: "D", result: MatchResult.WIN },
  { id: "sf2-d", round: 1, playerId: "D", opponentId: "C", result: MatchResult.LOSS },
  { id: "f-a", round: 2, playerId: "A", opponentId: "C", result: MatchResult.WIN },
  { id: "f-c", round: 2, playerId: "C", opponentId: "A", result: MatchResult.LOSS },
];

const singleElim = computeStandings({
  mode: "singleelimination",
  matches,
  options: {
    eventId: "SE-DEMO",
    seeding: { A: 1, C: 2, B: 3, D: 4 },
  },
});

console.table(
  singleElim.map(r => ({
    Rank: r.rank,
    Player: r.playerId,
    EliminationRound: r.eliminationRound,
  }))
);
```

---

### `computeStandings` options (updated)

```ts
interface ComputeStandingsRequest {
  mode: "swiss" | "roundrobin" | "singleelimination";
  matches: Match[];
  options?: {
    eventId?: string;
    applyHeadToHead?: boolean;
    tiebreakFloors?: { opponentPctFloor?: number };
    points?: { win?: number; draw?: number; loss?: number; bye?: number };
    acceptSingleEntryMatches?: boolean;
    seeding?: Record<string, number>;
    useBronzeMatch?: boolean;
    /** NEW: include BYEs in OMW%/OGWP via virtual opponent */
    tiebreakVirtualBye?: {
      enabled?: boolean;
      mwp?: number;
      gwp?: number;
    };
  };
}
```

---

## ♻️ Pairings

Use the facade to generate **Swiss**, **Round‑Robin**, or **Single Elimination** pairings.

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

### Round‑Robin Pairings (per round)

```ts
import { generatePairings } from "rankings-core";

const rr = generatePairings({
  mode: "roundrobin",
  players: ["A", "B", "C", "D", "E"],
  roundNumber: 2,
});

console.log(rr);
/*
{
  pairings: [ {a:"A", b:"C"}, {a:"B", b:"D"} ],
  round: 2,
  byes: ["E"],
  bye: "E"
}
*/
```

Or build all rounds up‑front:

```ts
import { buildRoundRobinSchedule } from "rankings-core";

const rounds = buildRoundRobinSchedule(["A","B","C","D"]);
/*
[
  { round: 1, pairings: [{a:"A",b:"B"},{a:"C",b:"D"}], byes: [] },
  { round: 2, pairings: [{a:"A",b:"C"},{a:"B",b:"D"}], byes: [] },
  { round: 3, pairings: [{a:"A",b:"D"},{a:"B",b:"C"}], byes: [] }
]
*/
```

### ✅ Single Elimination Pairings (new)

Use the **facade** to request pairings for any round. Under the hood, it builds a full bracket, auto‑advances R1 BYEs, and returns the pairings for the requested round along with the full `bracket` object.

```ts
import { generatePairings, type SingleElimSeedEntry } from "rankings-core";

// 5 entrants → 8-slot bracket → R1 will contain BYEs
const seeds: ReadonlyArray<SingleElimSeedEntry> = [
  { playerId: "A", seed: 1 },
  { playerId: "B", seed: 2 },
  { playerId: "C", seed: 3 },
  { playerId: "D", seed: 4 },
  { playerId: "E", seed: 5 },
];

// Round 1 (quarters in size=8): returns concrete pairings + byes if any
const r1 = generatePairings({
  mode: "singleelimination",
  seeds,
  roundNumber: 1,
  options: { bestOf: 3, thirdPlace: true }
});

console.log(r1.pairings, r1.byes, r1.bracket);

// Later, after reporting R1 results, you can request Round 2 (semis) pairings:
const r2 = generatePairings({
  mode: "singleelimination",
  seeds,
  roundNumber: 2
});
```

#### Low-level Single Elimination utilities (advanced)

```ts
import {
  generateSingleEliminationBracket,
  applyResult,
  autoAdvanceByes,
  seedPositions,
  type SingleElimSeedEntry as SeedEntry,
} from "rankings-core";

const bracket = generateSingleEliminationBracket(
  [
    { playerId: "A", seed: 1 },
    { playerId: "B", seed: 2 },
    { playerId: "C", seed: 3 },
    { playerId: "D", seed: 4 },
    { playerId: "E", seed: 5 }, // → auto-fills BYEs to reach power-of-two
  ],
  { bestOf: 3, thirdPlace: true }
);

// R1 BYEs auto-advance on generation; you can call this again if you mutate:
autoAdvanceByes(bracket);

// Report a result by match id:
applyResult(bracket, "R1-M1", { winner: "A" });

// Semifinal losers route to the "BRONZE" match automatically when `thirdPlace: true`.

// Seeding helper (interleaving):
console.log(seedPositions(8)); // [1, 8, 4, 5, 2, 7, 3, 6]
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
| Standings | Swiss · Round‑Robin · Single Elimination, tie‑breakers, BYEs, penalties, double‑loss cases |
| Pairings  | Swiss pairing rules, rematch avoidance, backtracking, RR schedules, **Single Elimination bracket + round pairings** |
| Ratings   | ELO updates, draws, per‑player K, floors, caps, modes |
| Core      | Determinism, immutability, snapshot stability |

Run locally:

```bash
npm test
# or
npx vitest run --coverage
```

---

## 🧭 Migration Notes

If you’re upgrading from a previous version (≤ 1.x) of **`rankings-core`**, here’s what’s new and what stays compatible:

- **Existing Swiss and Round-Robin code works unchanged.**  
  You can continue using `computeStandings({ mode: "swiss" | "roundrobin" })` as before.

- **New:** `mode: "singleelimination"` is now supported by the same unified `computeStandings()` API.  
  It introduces a new `eliminationRound` field in results to indicate how far each player advanced.  
  Example: in a 4-player bracket (maxRound = 2), the champion gets `eliminationRound = 3`.

- **New type exports:**  
  - `ComputeSingleElimOptions` for configuration  
  - `SingleElimStandingRow` for output type with `eliminationRound`
  - `SingleElimSeedEntry`, `SingleElimBracket` for pairings

- **Double-loss support:** both players can be given `MatchResult.LOSS` in the same pairing.  
  Just make sure both sides are explicitly recorded.

- **No breaking changes:** all existing imports, Swiss tie-breakers, and pairing utilities remain compatible.

---

## 🗺️ Roadmap

- [x] Round‑Robin standings & schedules  
- [x] Unified `computeStandings()` dispatcher  
- [x] `acceptSingleEntryMatches` (lenient ingestion)  
- [x] Optional WebAssembly build for browsers  
- [x] Single Elimination pairing generator + facade support 
- [x] Single Elimination standings engine + eliminationRound support
- [x] **Swiss option to use virtual player for OMW% calculation** ✅  
- [ ] Glicko‑2 rating system  
- [ ] JSON schema validation  

---

## 📜 License

MIT © 2025 — `rankings-core` authors
