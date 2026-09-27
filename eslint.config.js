import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    // Route/component modules expose named render targets and pure helpers to
    // integration tests. They are not consumed through Vite hot-reload boundaries.
    files: [
      'src/features/player/TeamMobileApp.tsx',
      'src/routes/PlayerRoute.tsx',
      'src/routes/RefereeRoute.tsx',
    ],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
])
