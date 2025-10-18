import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    exclude: ['node_modules', 'dist', 'build', 'coverage', '.git', '.turbo'],
    globals: true,
    environment: 'node',
    clearMocks: true,
  },
});