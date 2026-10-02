import { defineConfig, devices } from '@playwright/test'

/**
 * `e2e-real`: the SPA against the REAL backend (no stubs). Needs the dev database from
 * `HCMUSSupportV2.Backend/appsettings.Development.local.json` (created and migrated on first start) with
 * `Auth:DevLogin:Enabled=true`. The backend runs on 5261 (not the default 5161, so it can sit next to a
 * developer's own backend) and a dedicated vite on 5275 proxies `/api` to it.
 */
const API_PORT = Number(process.env.E2E_API_PORT ?? 5261)
const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 5275)

export default defineConfig({
  testDir: './e2e',
  testMatch: /real([.-][\w-]+)?\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { ...devices['Desktop Chrome'], locale: 'vi-VN', timezoneId: 'Asia/Ho_Chi_Minh' },
  projects: [{ name: 'e2e-real', use: { baseURL: `http://localhost:${WEB_PORT}` } }],
  webServer: [
    {
      // --no-launch-profile: the `http` profile would open a browser and pin port 5161.
      command: 'dotnet run --project ../HCMUSSupportV2.Backend --no-launch-profile',
      url: `http://localhost:${API_PORT}/api/system/info`,
      env: {
        ASPNETCORE_ENVIRONMENT: 'Development',
        ASPNETCORE_URLS: `http://localhost:${API_PORT}`,
        // The suite signs in a dozen times from one IP; the default 20 auth requests a minute would answer 429.
        RateLimiting__Auth__PermitLimit: '1000',
      },
      reuseExistingServer: !process.env.CI,
      timeout: 240_000,
    },
    {
      command: `npx vite --port ${WEB_PORT} --strictPort`,
      url: `http://localhost:${WEB_PORT}`,
      env: { VITE_MOCK_AUTH: '', API_PROXY_TARGET: `http://localhost:${API_PORT}` },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
})
