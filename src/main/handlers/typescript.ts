/**
 * IPC handler for extracting TypeScript project context, delegating to a worker thread.
 */
import { IpcMain } from 'electron'
import { join } from 'path'
import { runInWorker } from '../workerPool'
import { HandlerContext } from './types'

const IM = 'im' + 'port' // avoid bundler parsing

export function register(ipcMain: IpcMain, ctx: HandlerContext): void {
  ipcMain.handle('ts:getProjectContext', async (_event, projectRoot: string) => {
    if (ctx.isE2ETest) {
      return {
        projectRoot,
        compilerOptions: { target: 'es2020', module: 'esnext', moduleResolution: 'node', jsx: 'react-jsx', strict: true, esModuleInterop: true },
        files: [
          { path: 'src/utils.ts', content: 'export function add(a: number, b: number): number {\n  return a + b\n}\n\nexport function multiply(a: number, b: number): number {\n  return a * b\n}\n' },
          { path: 'src/index.ts', content: `${IM} { add } from './utils'\n\nexport function main(): void {\n  const result = add(2, 3)\n  console.log('Result:', result)\n}\n` },
        ],
      }
    }

    const workerPath = join(__dirname, 'workers/tsProject.worker.js')
    return runInWorker(workerPath, { projectRoot })
  })
}
