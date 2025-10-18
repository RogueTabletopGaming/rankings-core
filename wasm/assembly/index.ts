//@ts-nocheck
// AssemblyScript (NOT regular TS)
export function expectedScore(rA: f64, rB: f64): f64 {
  return 1.0 / (1.0 + Math.pow(10.0, (rB - rA) / 400.0));
}
