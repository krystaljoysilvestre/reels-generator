import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    passWithNoTests: true,
    // FFmpeg integration tests spawn several encodes/probes. They finish in ~4–6s alone but can cross
    // Vitest's 5s default when every workspace package runs concurrently in CI. Keep their assertions
    // strict and give the subprocess work a realistic ceiling instead of accepting a scheduling flake.
    testTimeout: 15_000,
  },
})
