import { IpcMain } from 'electron'
import { readFile } from 'fs/promises'
import { join } from 'path'
import simpleGit from 'simple-git'
import { statusFromChar } from '../gitStatusParser'
import { HandlerContext } from './types'
import { getScenarioData } from './scenarios'

async function handleGetBranch(ctx: HandlerContext, repoPath: string) {
  if (ctx.isE2ETest) {
    const scenario = getScenarioData(ctx.e2eScenario)
    return scenario.branches[repoPath] || 'main'
  }

  try {
    const git = simpleGit(repoPath)
    const status = await git.status()
    return status.current || 'unknown'
  } catch {
    return 'unknown'
  }
}

async function handleIsGitRepo(ctx: HandlerContext, dirPath: string) {
  if (ctx.isE2ETest) {
    return true
  }

  try {
    const git = simpleGit(dirPath)
    return await git.checkIsRepo()
  } catch {
    return false
  }
}

async function handleStatus(ctx: HandlerContext, repoPath: string) {
  if (ctx.isE2ETest) {
    const scenario = getScenarioData(ctx.e2eScenario)
    const mockMerge = process.env.E2E_MOCK_MERGE
    return {
      ...scenario.gitStatus,
      current: scenario.branches[repoPath] || 'main',
      isMerging: mockMerge === 'true' || mockMerge === 'conflicts',
      hasConflicts: mockMerge === 'conflicts',
    }
  }

  try {
    const git = simpleGit(repoPath)
    // Use -uall to list individual files inside untracked directories
    const status = await git.status(['-uall'])
    const files: { path: string; status: string; staged: boolean; indexStatus: string; workingDirStatus: string }[] = []

    for (const file of status.files) {
      const indexStatus = file.index || ' '
      const workingDirStatus = file.working_dir || ' '
      const hasIndexChange = indexStatus !== ' ' && indexStatus !== '?'
      const hasWorkingDirChange = workingDirStatus !== ' ' && workingDirStatus !== '?'

      if (hasIndexChange) {
        files.push({ path: file.path, status: statusFromChar(indexStatus), staged: true, indexStatus, workingDirStatus })
      }

      if (hasWorkingDirChange || (!hasIndexChange && workingDirStatus === '?')) {
        files.push({ path: file.path, status: statusFromChar(workingDirStatus), staged: false, indexStatus, workingDirStatus })
      } else if (!hasIndexChange) {
        // Shouldn't happen, but handle gracefully
        files.push({ path: file.path, status: 'modified', staged: false, indexStatus, workingDirStatus })
      }
    }

    const isMerging = await git.raw(['rev-parse', '--verify', 'MERGE_HEAD']).then(() => true).catch(() => false)
    const unmergedFiles = status.files.filter(f => f.index === 'U' || f.working_dir === 'U')
    let hasConflicts = false
    for (const file of unmergedFiles) {
      try {
        const content = await readFile(join(repoPath, file.path), 'utf-8')
        if (content.includes('<<<<<<<')) {
          hasConflicts = true
          break
        }
      } catch {
        hasConflicts = true
        break
      }
    }

    return {
      files,
      ahead: status.ahead,
      behind: status.behind,
      tracking: status.tracking,
      current: status.current,
      isMerging,
      hasConflicts,
    }
  } catch {
    return { files: [], ahead: 0, behind: 0, tracking: null, current: null, isMerging: false, hasConflicts: false }
  }
}

async function handleStage(ctx: HandlerContext, repoPath: string, filePath: string) {
  if (ctx.isE2ETest) {
    return { success: true }
  }

  try {
    const git = simpleGit(repoPath)
    await git.add([filePath])
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
}

async function handleStageAll(ctx: HandlerContext, repoPath: string) {
  if (ctx.isE2ETest) {
    return { success: true }
  }

  try {
    const git = simpleGit(repoPath)
    await git.add('.')
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
}

async function handleUnstage(ctx: HandlerContext, repoPath: string, filePath: string) {
  if (ctx.isE2ETest) {
    return { success: true }
  }

  try {
    const git = simpleGit(repoPath)
    await git.reset(['HEAD', '--', filePath])
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
}

async function handleCheckoutFile(ctx: HandlerContext, repoPath: string, filePath: string) {
  if (ctx.isE2ETest) {
    return { success: true }
  }

  try {
    const git = simpleGit(repoPath)
    await git.checkout(['--', filePath])
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
}

async function handleCommit(ctx: HandlerContext, repoPath: string, message: string) {
  if (ctx.isE2ETest) {
    return { success: true }
  }

  if (!message || message.trim() === '') {
    return { success: false, error: 'Commit message cannot be empty' }
  }

  try {
    const git = simpleGit(repoPath)
    await git.commit(message)
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
}

async function handleCommitMerge(ctx: HandlerContext, repoPath: string) {
  if (ctx.isE2ETest) {
    return { success: true }
  }

  try {
    const git = simpleGit(repoPath)
    await git.raw(['commit', '--no-edit'])
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
}

async function handlePush(ctx: HandlerContext, repoPath: string) {
  if (ctx.isE2ETest) {
    return { success: true }
  }

  try {
    const git = simpleGit(repoPath)
    await git.push()
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
}

async function handlePull(ctx: HandlerContext, repoPath: string) {
  if (ctx.isE2ETest) {
    return { success: true }
  }

  try {
    const git = simpleGit(repoPath)
    await git.pull()
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
}

async function handleDiff(ctx: HandlerContext, repoPath: string, filePath?: string) {
  if (ctx.isE2ETest) {
    return getScenarioData(ctx.e2eScenario).diff
  }

  try {
    const git = simpleGit(repoPath)
    if (filePath) {
      return await git.diff([filePath])
    }
    return await git.diff()
  } catch {
    return ''
  }
}

async function handleShow(ctx: HandlerContext, repoPath: string, filePath: string, ref = 'HEAD') {
  if (ctx.isE2ETest) {
    return getScenarioData(ctx.e2eScenario).show(filePath)
  }

  try {
    const git = simpleGit(repoPath)
    const result = await git.raw(['show', `${ref}:${filePath}`])
    return result
  } catch (error) {
    console.error('git show error:', error)
    return ''
  }
}

export function register(ipcMain: IpcMain, ctx: HandlerContext): void {
  ipcMain.handle('git:getBranch', (_event, repoPath: string) => handleGetBranch(ctx, repoPath))
  ipcMain.handle('git:isGitRepo', (_event, dirPath: string) => handleIsGitRepo(ctx, dirPath))
  ipcMain.handle('git:status', (_event, repoPath: string) => handleStatus(ctx, repoPath))
  ipcMain.handle('git:stage', (_event, repoPath: string, filePath: string) => handleStage(ctx, repoPath, filePath))
  ipcMain.handle('git:stageAll', (_event, repoPath: string) => handleStageAll(ctx, repoPath))
  ipcMain.handle('git:unstage', (_event, repoPath: string, filePath: string) => handleUnstage(ctx, repoPath, filePath))
  ipcMain.handle('git:checkoutFile', (_event, repoPath: string, filePath: string) => handleCheckoutFile(ctx, repoPath, filePath))
  ipcMain.handle('git:commit', (_event, repoPath: string, message: string) => handleCommit(ctx, repoPath, message))
  ipcMain.handle('git:commitMerge', (_event, repoPath: string) => handleCommitMerge(ctx, repoPath))
  ipcMain.handle('git:push', (_event, repoPath: string) => handlePush(ctx, repoPath))
  ipcMain.handle('git:pull', (_event, repoPath: string) => handlePull(ctx, repoPath))
  ipcMain.handle('git:diff', (_event, repoPath: string, filePath?: string) => handleDiff(ctx, repoPath, filePath))
  ipcMain.handle('git:show', (_event, repoPath: string, filePath: string, ref = 'HEAD') => handleShow(ctx, repoPath, filePath, ref))
}
