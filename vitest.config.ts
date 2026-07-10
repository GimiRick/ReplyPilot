import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/cli.ts', 'src/index.ts', 'src/llm/provider.ts', 'src/whatsapp/client.ts'],
      thresholds: {
        lines: 97,
        functions: 95,
        statements: 97,
        branches: 90,
      },
    },
  },
});
