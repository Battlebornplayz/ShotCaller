import { defineConfig } from 'rolldown';

// Bundles the AI module tests into one file Node can run (npm run test:modules).
export default defineConfig({
  input: 'tests/modules/run.ts',
  platform: 'node',
  external: [/^node:/],
  output: { file: 'out/mod-test/run.cjs', format: 'cjs' },
});
