import { defineConfig, devices } from '@playwright/test'

/**
 * Two dev servers: one with the mock user (shell tests), one without (login, role and 401 tests, where
 * `/api/auth/me` is stubbed per test with `page.route`). No backend is needed for either.
 */
const MOCK_PORT = 5273
const PLAIN_PORT = 5274
/** Dev-only Markdown playground (`/dev/markdown`); mock auth only so the app shell's `/api/auth/me` needs no backend. */
const MARKDOWN_PORT = 5373
/** D11 career pages (Lương, Chức vụ, Khen thưởng) on the mock user. */
const CAREER_PORT = 5383

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  reporter: [['list']],
  use: { ...devices['Desktop Chrome'], locale: 'vi-VN', timezoneId: 'Asia/Ho_Chi_Minh' },
  projects: [
    {
      name: 'mock',
      testMatch: /shell\.spec\.ts/,
      use: { baseURL: `http://localhost:${MOCK_PORT}` },
    },
    {
      name: 'plain',
      testMatch: /auth\.spec\.ts/,
      use: { baseURL: `http://localhost:${PLAIN_PORT}` },
    },
    {
      name: 'markdown',
      testMatch: /markdown\.spec\.ts/,
      use: { baseURL: `http://localhost:${MARKDOWN_PORT}` },
    },
    {
      name: 'career',
      testMatch: /career\.spec\.ts/,
      use: { baseURL: `http://localhost:${CAREER_PORT}` },
    },
  ],
  webServer: [
    {
      command: `npx vite --port ${MOCK_PORT} --strictPort`,
      url: `http://localhost:${MOCK_PORT}`,
      env: { VITE_MOCK_AUTH: '1' },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: `npx vite --port ${PLAIN_PORT} --strictPort`,
      url: `http://localhost:${PLAIN_PORT}`,
      env: { VITE_MOCK_AUTH: '' },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: `npx vite --port ${MARKDOWN_PORT} --strictPort`,
      url: `http://localhost:${MARKDOWN_PORT}`,
      env: { VITE_MOCK_AUTH: '1' },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: `npx vite --port ${CAREER_PORT} --strictPort`,
      url: `http://localhost:${CAREER_PORT}`,
      env: { VITE_MOCK_AUTH: '1' },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
})
