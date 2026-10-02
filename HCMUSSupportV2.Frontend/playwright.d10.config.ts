import { defineConfig, devices } from '@playwright/test'

const PORT = 5473
export default defineConfig({
  testDir: './e2e',
  testMatch: /profile\.spec\.ts/,
  fullyParallel: true,
  reporter: [['list']],
  use: { ...devices['Desktop Chrome'], locale: 'vi-VN', timezoneId: 'Asia/Ho_Chi_Minh', baseURL: `http://localhost:${PORT}` },
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    env: { VITE_MOCK_AUTH: '1' },
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
