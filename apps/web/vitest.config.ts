import { defineConfig } from 'vitest/config'

// PGlite-backed tests (migrate + place sync) can exceed the 5s default under parallel turbo load.
export default defineConfig({
  test: { include: ['test/**/*.test.ts'], testTimeout: 30000, hookTimeout: 30000 },
})
