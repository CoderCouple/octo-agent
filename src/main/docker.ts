/**
 * Docker container lifecycle management for agent isolation.
 *
 * Uses `docker` CLI directly — no SDK dependency.
 * Containers are persistent per-repo and survive app restarts.
 */
import { execFile, spawn } from 'child_process'
import { promisify } from 'util'
import { createHash } from 'crypto'
import { platform } from 'os'
import type { HandlerContext } from './handlers/types'
import type { DockerStatus, ContainerInfo } from '../preload/apis/types'

const execFileAsync = promisify(execFile)

/** Shells available inside the container image, checked in order. */
export const CONTAINER_SHELLS = [
  { path: '/bin/bash', name: 'Bash', isDefault: true },
  { path: '/bin/sh', name: 'sh', isDefault: false },
]

export const DEFAULT_DOCKER_IMAGE = 'node:22-slim'

/** ANSI escape helpers for styled terminal output. */
const ANSI = {
  dim: (text: string) => `\x1b[2m${text}\x1b[22m`,
  bold: (text: string) => `\x1b[1m${text}\x1b[22m`,
  cyan: (text: string) => `\x1b[36m${text}\x1b[39m`,
  reset: '\x1b[0m',
}

/** Mapping from agent command to npm install command. */
const AGENT_INSTALL_COMMANDS: Record<string, string> = {
  claude: 'npm install -g @anthropic-ai/claude-code',
  codex: 'npm install -g @openai/codex',
  gemini: 'npm install -g @google/gemini-cli',
}

/**
 * Per-repo setup lock. Prevents concurrent container creation, setup, and
 * agent install for the same repo — the second caller waits for the first
 * to finish, then gets the already-running container.
 */
const setupLocks = new Map<string, Promise<void>>()

/** Acquire a per-repo lock. Returns a release function. */
export function acquireSetupLock(repoDir: string): Promise<() => void> {
  const prev = setupLocks.get(repoDir) ?? Promise.resolve()
  let release: () => void
  const next = new Promise<void>((resolve) => { release = resolve })
  setupLocks.set(repoDir, next)
  return prev.then(() => release!)
}

/** Deterministic container name based on repo path. Uses the directory basename
 *  for readability, with a short hash suffix to handle duplicate directory names. */
export function containerName(repoDir: string): string {
  const basename = repoDir.split('/').filter(Boolean).pop() || 'repo'
  // Sanitize for Docker container names: lowercase, alphanumeric + hyphens
  const sanitized = basename.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').substring(0, 30)
  const hash = createHash('sha256').update(repoDir).digest('hex').substring(0, 8)
  return `broomy-${sanitized}-${hash}`
}

export async function isDockerAvailable(): Promise<DockerStatus> {
  try {
    await execFileAsync('docker', ['version', '--format', '{{.Server.Version}}'])
    return { available: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)

    // Docker CLI not found
    if (message.includes('ENOENT') || message.includes('not found')) {
      const installUrl = platform() === 'darwin'
        ? 'https://docker.com/products/docker-desktop'
        : 'https://docs.docker.com/engine/install/'
      return { available: false, error: 'Docker is not installed', installUrl }
    }

    // Daemon not running
    const installUrl = platform() === 'darwin'
      ? 'https://docker.com/products/docker-desktop'
      : 'https://docs.docker.com/engine/install/'
    return { available: false, error: 'Docker daemon is not running', installUrl }
  }
}

export async function imageExists(image: string): Promise<boolean> {
  try {
    await execFileAsync('docker', ['image', 'inspect', image])
    return true
  } catch {
    return false
  }
}

/**
 * Pull an image from Docker Hub, streaming progress to onProgress.
 */
export async function pullImage(
  image: string,
  onProgress: (line: string) => void,
): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    const child = spawn('docker', ['pull', image], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    child.stdout.on('data', (data: Buffer) => {
      for (const line of data.toString().split('\n')) {
        if (line) onProgress(`${ANSI.dim(`  ${line}`)}\r\n`)
      }
    })

    child.stderr.on('data', (data: Buffer) => {
      for (const line of data.toString().split('\n')) {
        if (line) onProgress(`${ANSI.dim(`  ${line}`)}\r\n`)
      }
    })

    child.on('error', (err) => {
      resolve({ success: false, error: err.message })
    })

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true })
      } else {
        resolve({ success: false, error: `docker pull exited with code ${code}` })
      }
    })
  })
}

/**
 * First-time container setup: install system packages.
 */
export async function setupContainer(
  containerId: string,
  onProgress: (line: string) => void,
): Promise<{ success: boolean; error?: string }> {
  onProgress(`${ANSI.cyan('▸ Installing system packages (git, curl)...')}\r\n`)

  return new Promise((resolve) => {
    const child = spawn('docker', [
      'exec', containerId,
      'bash', '-c',
      'apt-get update && apt-get install -y --no-install-recommends git curl ca-certificates && rm -rf /var/lib/apt/lists/*',
    ], { stdio: ['ignore', 'pipe', 'pipe'] })

    child.stdout.on('data', (data: Buffer) => {
      for (const line of data.toString().split('\n')) {
        if (line) onProgress(`${ANSI.dim(`  ${line}`)}\r\n`)
      }
    })

    child.stderr.on('data', (data: Buffer) => {
      for (const line of data.toString().split('\n')) {
        if (line) onProgress(`${ANSI.dim(`  ${line}`)}\r\n`)
      }
    })

    child.on('error', (err) => {
      resolve({ success: false, error: err.message })
    })

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true })
      } else {
        resolve({ success: false, error: `Container setup exited with code ${code}` })
      }
    })
  })
}

/**
 * Check if an agent command is installed in the container; if not, install it.
 */
export async function ensureAgentInstalled(
  containerId: string,
  agentCommand: string,
  onProgress: (line: string) => void,
): Promise<{ success: boolean; error?: string }> {
  // Check if agent is already installed
  try {
    await execFileAsync('docker', ['exec', containerId, 'which', agentCommand])
    return { success: true }
  } catch {
    // Not installed — continue to install
  }

  const installCmd = AGENT_INSTALL_COMMANDS[agentCommand]
  if (!installCmd) {
    // Unknown agent — skip install, let docker exec fail naturally if command not found
    return { success: true }
  }

  onProgress(`${ANSI.cyan(`▸ Installing ${agentCommand}...`)}\r\n`)

  return new Promise((resolve) => {
    const child = spawn('docker', [
      'exec', containerId, 'bash', '-c', installCmd,
    ], { stdio: ['ignore', 'pipe', 'pipe'] })

    child.stdout.on('data', (data: Buffer) => {
      for (const line of data.toString().split('\n')) {
        if (line) onProgress(`${ANSI.dim(`  ${line}`)}\r\n`)
      }
    })

    child.stderr.on('data', (data: Buffer) => {
      for (const line of data.toString().split('\n')) {
        if (line) onProgress(`${ANSI.dim(`  ${line}`)}\r\n`)
      }
    })

    child.on('error', (err) => {
      resolve({ success: false, error: err.message })
    })

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true })
      } else {
        resolve({ success: false, error: `${agentCommand} install exited with code ${code}` })
      }
    })
  })
}

/**
 * Ensure a persistent container exists for a repo directory.
 * Reuses existing running containers, restarts stopped ones, or creates new ones.
 */
export async function ensureContainer(
  ctx: HandlerContext,
  repoDir: string,
  image?: string,
  onProgress?: (line: string) => void,
): Promise<{ success: boolean; error?: string; containerId?: string; isNew?: boolean }> {
  const name = containerName(repoDir)
  const img = image || DEFAULT_DOCKER_IMAGE
  const progress = onProgress || (() => {})

  // Check if container already exists (by name, survives app restarts)
  try {
    const { stdout } = await execFileAsync('docker', [
      'inspect', '--format', '{{.State.Status}}\t{{.Id}}', name,
    ])
    const [status, containerId] = stdout.trim().split('\t')

    if (status === 'running') {
      ctx.dockerContainers.set(repoDir, { containerId, repoDir, image: img })
      return { success: true, containerId, isNew: false }
    }

    if (status === 'exited' || status === 'created') {
      progress(`${ANSI.cyan('▸ Restarting container...')}\r\n`)
      await execFileAsync('docker', ['start', name])
      ctx.dockerContainers.set(repoDir, { containerId, repoDir, image: img })
      return { success: true, containerId, isNew: false }
    }

    // Unknown state (dead, removing, paused, etc.) — remove and recreate
    try { await execFileAsync('docker', ['rm', '-f', name]) } catch { /* ignore */ }
  } catch {
    // Container doesn't exist — will create below
  }

  // Pull image if not available locally
  const hasImage = await imageExists(img)
  if (!hasImage) {
    progress(`${ANSI.cyan(`▸ Pulling ${img}...`)}\r\n`)
    const pullResult = await pullImage(img, progress)
    if (!pullResult.success) {
      return { success: false, error: `Failed to pull image: ${pullResult.error}` }
    }
  }

  try {
    progress(`${ANSI.cyan('▸ Creating container...')}\r\n`)
    const { stdout } = await execFileAsync('docker', [
      'run', '-d',
      '--name', name,
      '-v', `${repoDir}:${repoDir}`,
      '-w', repoDir,
      img,
      'sleep', 'infinity',
    ])

    const containerId = stdout.trim()
    ctx.dockerContainers.set(repoDir, { containerId, repoDir, image: img })
    return { success: true, containerId, isNew: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}

export async function stopContainer(
  ctx: HandlerContext,
  repoDir: string,
): Promise<void> {
  const name = containerName(repoDir)
  ctx.dockerContainers.delete(repoDir)
  try {
    await execFileAsync('docker', ['stop', name])
  } catch {
    // Ignore — container may already be gone
  }
}

export async function resetContainer(
  ctx: HandlerContext,
  repoDir: string,
): Promise<void> {
  const name = containerName(repoDir)
  ctx.dockerContainers.delete(repoDir)
  try {
    await execFileAsync('docker', ['rm', '-f', name])
  } catch {
    // Ignore — container may already be gone
  }
}

/**
 * Stop all broomy containers — both tracked (in-memory map) and orphaned
 * (from previous runs that weren't cleaned up). Uses `docker ps` to find
 * all containers matching the `broomy-` naming convention.
 */
export async function stopAllContainers(ctx: HandlerContext): Promise<void> {
  ctx.dockerContainers.clear()
  try {
    const { stdout } = await execFileAsync('docker', [
      'ps', '-q', '--filter', 'name=broomy-',
    ])
    const ids = stdout.trim().split('\n').filter(Boolean)
    if (ids.length > 0) {
      await execFileAsync('docker', ['stop', ...ids])
    }
  } catch {
    // Docker not available or no containers — ignore
  }
}

export async function getContainerInfo(
  ctx: HandlerContext,
  repoDir: string,
): Promise<ContainerInfo | null> {
  const state = ctx.dockerContainers.get(repoDir)
  if (!state) return null

  let status: ContainerInfo['status'] = 'stopped'
  try {
    const { stdout } = await execFileAsync('docker', [
      'inspect', '--format', '{{.State.Status}}', containerName(repoDir),
    ])
    const dockerStatus = stdout.trim()
    if (dockerStatus === 'running') status = 'running'
    else if (dockerStatus === 'created') status = 'starting'
  } catch {
    // Container gone
    return null
  }

  return {
    containerId: state.containerId.substring(0, 12),
    status,
    image: state.image,
    repoDir: state.repoDir,
  }
}

export function buildDockerExecArgs(
  containerId: string,
  cwd: string,
  env: Record<string, string>,
  command?: string,
): string[] {
  // Run as non-root user (node:22-slim has 'node' user at uid 1000)
  const args: string[] = ['exec', '-it', '-u', 'node', '-w', cwd]

  for (const [key, value] of Object.entries(env)) {
    args.push('-e', `${key}=${value}`)
  }

  args.push(containerId)

  if (command) {
    args.push('bash', '-l', '-c', command)
  } else {
    args.push('bash', '-l')
  }

  return args
}

/**
 * Returns a friendly terminal error box when Docker is unavailable.
 */
export function dockerSetupMessage(status: DockerStatus): string {
  const installLine = status.installUrl
    ? `  Install: ${status.installUrl}`
    : ''

  const macInstall = '  • macOS: Download Docker Desktop from\n    https://docker.com/products/docker-desktop'
  const linuxInstall = '  • Linux: curl -fsSL https://get.docker.com | sh'

  return [
    '╭────────────────────────────────────────────────────╮',
    '│  Docker is required for container isolation         │',
    '│                                                     │',
    `│  ${status.error || 'Docker is not available'}`,
    '│                                                     │',
    '│  To install:                                        │',
    `│  ${macInstall}`,
    `│  ${linuxInstall}`,
    '│                                                     │',
    installLine ? `│  ${installLine}` : null,
    '│  After installing, start Docker and restart         │',
    '│  this session.                                      │',
    '│                                                     │',
    '│  Or disable container isolation in repo settings.   │',
    '╰────────────────────────────────────────────────────╯',
    '',
  ].filter((l) => l !== null).join('\r\n')
}
