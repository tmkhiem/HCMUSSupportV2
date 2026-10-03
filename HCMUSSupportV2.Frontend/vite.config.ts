/// <reference types="vitest/config" />
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'

/** Short content hash of a file in `public/`, used as a cache-busting query for assets that keep their name across builds. */
const publicHash = (file: string) =>
  createHash('sha1').update(readFileSync(new URL(`./public/${file}`, import.meta.url))).digest('hex').slice(0, 8)

// https://vite.dev/config/
export default defineConfig({
  define: { __BG_LOGO_VERSION__: JSON.stringify(publicHash('bg-logo.svg')) },
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] })
  ],
  build: {
    outDir: '../HCMUSSupportV2.Backend/wwwroot',
    emptyOutDir: true,
  },
  server: {
    // The API runs on the backend's launch-settings port. Cookies stay same-origin through this proxy.
    proxy: {
      '/api': { target: process.env.API_PROXY_TARGET ?? 'http://localhost:5161' },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
  },
})
