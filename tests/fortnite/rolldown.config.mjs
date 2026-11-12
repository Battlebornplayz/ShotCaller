import { defineConfig } from 'rolldown';

// Bundles the Fortnite test kit into one file Electron can run (npm run test:fortnite).
export default defineConfig({
  input: 'tests/fortnite/run.ts',
  platform: 'node',
  external: ['electron', /^node:/],
  output: { file: 'out/fn-test/run.cjs', format: 'cjs' },
});
