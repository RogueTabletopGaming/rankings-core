// rollup.config.mjs
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';

const plugins = [
  resolve({ extensions: ['.mjs', '.js', '.ts'] }),
  commonjs(),
  // Use the build tsconfig but avoid emitting d.ts from Rollup (tsc does that)
  typescript({
    tsconfig: './tsconfig.build.json',
    compilerOptions: { declaration: false, emitDeclarationOnly: false }
  })
];

export default [
  // Main library bundle
  {
    input: 'src/index.ts',
    output: [
      { file: 'dist/index.js', format: 'esm', sourcemap: true },
      { file: 'dist/index.cjs', format: 'cjs', sourcemap: true }
    ],
    plugins
  },

  // WASM loader entry
  {
    // If the file lives at src/wasm/index.ts, update this path accordingly
    input: 'wasm/index.ts',
    output: { file: 'dist/wasm/index.js', format: 'esm', sourcemap: true },
    plugins
  }
];
