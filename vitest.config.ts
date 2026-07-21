import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Explicit include, not just an exclude: vitest's own default include
    // glob (`**/*.{test,spec}.*`) would otherwise also match Playwright's
    // specs under tests/e2e/*.spec.ts and try to run them with the wrong
    // test runner.
    include: ['src/**/*.test.ts', 'components/**/*.test.ts'],
  },
})
