import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    // The complete UI suite shares jsdom workers and can exceed Vitest's
    // five-second default on slower CI runners even when focused tests pass.
    testTimeout: 15_000,
  },
})
