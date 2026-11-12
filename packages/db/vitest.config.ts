import { defineConfig } from 'vitest/config'

// PGlite migrations can exceed the default timeouts under parallel turbo load.
export default defineConfig({
  test: { include: ['test/**/*.test.ts'], testTimeout: 30000, hookTimeout: 30000 },
})
