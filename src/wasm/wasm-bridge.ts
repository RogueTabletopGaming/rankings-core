let wasmReady: Promise<Exports> | null = null;

export type Exports = {
  expectedScore(a: number, b: number): number;
  // add more exports as your AS module grows
};

async function load(url: string): Promise<Exports> {
  // Browser loader (streaming when possible)
  if (typeof WebAssembly.instantiateStreaming === 'function' && typeof fetch === 'function') {
    try {
      const res = await fetch(url);
      return (await WebAssembly.instantiateStreaming(res)).instance
        .exports as unknown as Exports;
    } catch {
      // fall back when dev servers serve the wrong MIME
    }
  }
  // Fallback (browser or Node with fetch)
  const buf = await (await fetch(url)).arrayBuffer();
  return (await WebAssembly.instantiate(buf)).instance
    .exports as unknown as Exports;
}

/** Memoized loader. Change the default URL if you serve under a subpath. */
export function getWasm(url = '/ratings.wasm'): Promise<Exports> {
  if (!wasmReady) wasmReady = load(url);
  return wasmReady;
}
