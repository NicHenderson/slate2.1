// Slate's browser tests (npm test). They serve this folder as it is — the
// app has no build — and run it in Chromium against a fake Supabase
// (tests/support/fakeSupabase.js), so no real account, database or network
// is ever involved.
const { defineConfig, devices } = require("@playwright/test");

const PORT = 4173; // not 8080, so a copy you're running by hand isn't disturbed

module.exports = defineConfig({
  testDir: "tests",
  testMatch: "**/*.spec.js",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0, // a test that fails once has found something: no quiet retries
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } }],
  webServer: {
    command: `python3 -m http.server ${PORT} --bind 127.0.0.1`,
    url: `http://127.0.0.1:${PORT}/index.html`,
    reuseExistingServer: !process.env.CI,
  },
});
