import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/cli.ts', 'src/whatsapp/client.ts'],
      thresholds: {
        lines: 95,
        functions: 90,
        statements: 95,
        branches: 90,
      },
    },
  },
});
