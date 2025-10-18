// Tiny ESM loader for ratings.wasm (browser + Node ≥18)

// Normalize to a real ArrayBuffer (never SharedArrayBuffer)
function toArrayBuffer(bytes: ArrayBufferLike): ArrayBuffer {
  if (bytes instanceof ArrayBuffer) return bytes;
  // Copy from SharedArrayBuffer into a fresh ArrayBuffer
  const out = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(out).set(new Uint8Array(bytes));
  return out;
}

async function loadWasmBinary(url: URL): Promise<ArrayBuffer> {
  // Browser path
  if (typeof fetch === "function") {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch WASM: ${res.status} ${res.statusText}`);
    return toArrayBuffer(await res.arrayBuffer()); // already ArrayBuffer, but safe
  }
  // Node path
  const { readFile } = await import("node:fs/promises");
  const buf = await readFile(url); // Node Buffer
  // Slice exact region and normalize to ArrayBuffer
  return toArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteLength + buf.byteOffset));
}

export async function init(): Promise<WebAssembly.Exports> {
  const wasmUrl = new URL("./ratings.wasm", import.meta.url);

  // Prefer streaming when available (browser + correct MIME)
  if (typeof WebAssembly.instantiateStreaming === "function" && typeof fetch === "function") {
    const res = await fetch(wasmUrl);
    if (!res.ok) throw new Error(`Failed to fetch WASM: ${res.status} ${res.statusText}`);
    const { instance } = await WebAssembly.instantiateStreaming(res as Response, {} as WebAssembly.Imports);
    return instance.exports;
  }

  // Fallback: bytes path (compile → instantiate to avoid overload issues)
  const ab = await loadWasmBinary(wasmUrl); // guaranteed ArrayBuffer
  const mod = await WebAssembly.compile(ab);
  const instance = await WebAssembly.instantiate(mod, {} as WebAssembly.Imports);
  return instance.exports;
}
