/**
 * Build only the main and preload processes (skip the slow renderer build).
 * Used by E2E dev mode where the renderer is served by Vite dev server.
 */
import { build } from 'vite'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { builtinModules } from 'module'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

const electronExternals = [
  'electron',
  'node-pty',
  'simple-git',
  ...builtinModules,
  ...builtinModules.map((m) => `node:${m}`),
]

// Shim that electron-vite normally injects to provide __dirname/__filename in ESM
const cjsShim = `\
import __cjs_url__ from "node:url";
import __cjs_path__ from "node:path";
import __cjs_mod__ from "node:module";
const __filename = __cjs_url__.fileURLToPath(import.meta.url);
const __dirname = __cjs_path__.dirname(__filename);
const require = __cjs_mod__.createRequire(import.meta.url);
`

// Build main process (index + workers — mirrors electron.vite.config.ts)
await build({
  configFile: false,
  root: ROOT,
  build: {
    ssr: true,
    outDir: 'out/main',
    rollupOptions: {
      input: {
        index: resolve(ROOT, 'src/main/index.ts'),
        'workers/fsSearch.worker': resolve(ROOT, 'src/main/workers/fsSearch.worker.ts'),
        'workers/tsProject.worker': resolve(ROOT, 'src/main/workers/tsProject.worker.ts'),
      },
      external: electronExternals,
      output: {
        format: 'es',
        entryFileNames: '[name].js',
        banner: cjsShim,
      },
    },
    emptyOutDir: true,
  },
})

// Build preload (CJS — no shim needed)
await build({
  configFile: false,
  root: ROOT,
  build: {
    ssr: true,
    outDir: 'out/preload',
    rollupOptions: {
      input: resolve(ROOT, 'src/preload/index.ts'),
      external: electronExternals,
      output: { format: 'cjs', entryFileNames: 'index.js' },
    },
    emptyOutDir: true,
  },
})
