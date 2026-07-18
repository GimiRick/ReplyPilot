import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/cli.ts'],
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  tsconfig: 'tsconfig.tsup.json',
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  external: ['whatsapp-web.js'],
});
