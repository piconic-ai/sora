import { defineConfig, devices } from '@playwright/test'

// Dedicated port, distinct from the ad-hoc dev-server ports used during
// manual testing, so a leftover `npm run dev` process never collides with
// a test run.
const port = 8793
const baseURL = `http://localhost:${port}`

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 15000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? '50%' : undefined,
  reporter: 'html',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // Firefox/WebKit run only the print-CSS and core form/list specs (see
    // each spec file's `test.skip(browserName !== ...)` guards where
    // present) — print CSS is exactly where this app has already been
    // burned by an engine-specific rendering gap, so it's worth the extra
    // browsers there even though the full IME/PDF-page-count assertions
    // stay Chromium-only (CDP-only APIs).
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
  webServer: {
    // Assets must be prebuilt before wrangler dev serves them (unlike
    // `npm run dev`, which watches — not needed for a one-shot test run).
    // `--live-reload` off: its injected websocket is noise here and could
    // perturb the pagehide-flush timing tests.
    command: `npm run build && wrangler dev --port ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 60000,
  },
})
