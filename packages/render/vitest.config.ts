import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    passWithNoTests: true,
    // FFmpeg integration tests spawn several encodes/probes. They usually finish in 6–14s but can cross
    // 15s when workspace tests or local builds contend for CPU. Keep their assertions strict and give
    // the subprocess work a realistic ceiling instead of accepting a scheduling flake.
    testTimeout: 30_000,
  },
})
