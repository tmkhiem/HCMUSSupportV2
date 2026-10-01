/// <reference types="vitest/config" />
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
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
      '/api': { target: 'http://localhost:5161' },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
  },
})
