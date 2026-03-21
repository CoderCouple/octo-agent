import { defineConfig } from 'vitest/config'
import { resolve } from 'path'
import { execSync } from 'child_process'

const gitCommit = (() => {
  try { return execSync('git rev-parse --short HEAD').toString().trim() }
  catch { return 'unknown' }
})()

export default defineConfig({
  define: {
    __BUILD_COMMIT__: JSON.stringify(gitCommit),
    __BUILD_TIME__: JSON.stringify('test'),
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src/renderer'),
    },
  },
  test: {
    environment: 'node',
    setupFiles: ['src/test/setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/**/*.stories.{ts,tsx}',
        'src/test/**',
        'src/renderer/main.tsx',
        'src/main/index.ts',
        'src/preload/index.ts',
        'src/renderer/vite-env.d.ts',
        'src/preload/apis/types.ts',
        'src/renderer/types/review.ts',
        'src/renderer/components/newSession/types.ts',
        'src/renderer/components/explorer/types.ts',
        'src/renderer/components/AuthTerminal.tsx',
        'src/renderer/components/DockerInfoPanel.tsx',
      ],
      thresholds: {
        lines: 90,
      },
    },
  },
})
