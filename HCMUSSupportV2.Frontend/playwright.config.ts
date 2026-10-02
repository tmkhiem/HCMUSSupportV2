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
/** D08 inbox (Tin tức) on the mock user and the synthetic inbox. */
const INBOX_PORT = 5483
/** D12 education pages (Đào tạo, Bồi dưỡng, Đi công tác) on the mock user. */
const EDUCATION_PORT = 5583
/** D13 Sáng kiến, Giảng dạy, Nghiên cứu khoa học on the mock user. */
const RESEARCH_PORT = 5593
/** D14b admin and groups pages: mock auth, `/api/**` stubbed in the spec. */
const ADMIN_PORT = 5393
/** D14c Nhân sự & email on the mock editor/admin. */
const EMPLOYEES_PORT = 5693
/** D09 notification editor (Quản lý thông báo) on the mock user and a stateful fake of `/api/manage/*` (e2e/editorFake.ts). */
const EDITOR_PORT = 5683

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  // The first visit of a page compiles its lazy chunks in vite dev, which can take a few seconds.
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: { ...devices['Desktop Chrome'], locale: 'vi-VN', timezoneId: 'Asia/Ho_Chi_Minh' },
  projects: [
    {
      name: 'mock',
      testMatch: /shell\.spec\.ts/,
      use: { baseURL: `http://localhost:${MOCK_PORT}` },
    },
    {
      name: 'profile',
      testMatch: /profile\.spec\.ts/,
      use: { baseURL: `http://localhost:${MOCK_PORT}` },
    },
    {
      name: 'plain',
      testMatch: /auth\.spec\.ts/,
      use: { baseURL: `http://localhost:${PLAIN_PORT}` },
    },
    {
      name: 'admin',
      testMatch: /admin\.spec\.ts/,
      use: { baseURL: `http://localhost:${ADMIN_PORT}` },
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
    {
      name: 'inbox',
      testMatch: /inbox\.spec\.ts/,
      use: { baseURL: `http://localhost:${INBOX_PORT}` },
    },
    {
      name: 'education',
      testMatch: /education\.spec\.ts/,
      use: { baseURL: `http://localhost:${EDUCATION_PORT}` },
    },
    {
      name: 'research',
      testMatch: /research\.spec\.ts/,
      use: { baseURL: `http://localhost:${RESEARCH_PORT}` },
    },
    {
      name: 'employees',
      testMatch: /employees\.spec\.ts/,
      use: { baseURL: `http://localhost:${EMPLOYEES_PORT}` },
    },
    {
      name: 'editor',
      testMatch: /(^|\/)editor\.spec\.ts$/,
      use: { baseURL: `http://localhost:${EDITOR_PORT}` },
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
    {
      command: `npx vite --port ${INBOX_PORT} --strictPort`,
      url: `http://localhost:${INBOX_PORT}`,
      env: { VITE_MOCK_AUTH: '1' },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: `npx vite --port ${EDUCATION_PORT} --strictPort`,
      url: `http://localhost:${EDUCATION_PORT}`,
      env: { VITE_MOCK_AUTH: '1' },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: `npx vite --port ${RESEARCH_PORT} --strictPort`,
      url: `http://localhost:${RESEARCH_PORT}`,
      env: { VITE_MOCK_AUTH: '1' },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: `npx vite --port ${ADMIN_PORT} --strictPort`,
      url: `http://localhost:${ADMIN_PORT}`,
      env: { VITE_MOCK_AUTH: '1' },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: `npx vite --port ${EMPLOYEES_PORT} --strictPort`,
      url: `http://localhost:${EMPLOYEES_PORT}`,
      env: { VITE_MOCK_AUTH: '1' },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: `npx vite --port ${EDITOR_PORT} --strictPort`,
      url: `http://localhost:${EDITOR_PORT}`,
      env: { VITE_MOCK_AUTH: '1' },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
})
