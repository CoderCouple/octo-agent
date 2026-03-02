import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'events'
import { E2EScenario, type HandlerContext } from './handlers/types'
import { buildDockerExecArgs, dockerSetupMessage, DEFAULT_DOCKER_IMAGE, CONTAINER_SHELLS, imageExists, containerName, setupContainer, ensureAgentInstalled, pullImage, ensureContainer, acquireSetupLock, stopAllContainers } from './docker'

// Mock child_process
const mockExecFile = vi.fn()
const mockSpawn = vi.fn()
vi.mock('child_process', () => ({
  execFile: (...args: unknown[]) => mockExecFile(...args),
  spawn: (...args: unknown[]) => mockSpawn(...args),
}))

// Mock electron
vi.mock('electron', () => ({
  app: { isPackaged: false },
}))

describe('buildDockerExecArgs', () => {
  it('builds args for command execution as non-root user with HOME set', () => {
    const args = buildDockerExecArgs('abc123', '/repo', { ANTHROPIC_API_KEY: 'sk-test' }, 'claude')
    expect(args).toEqual([
      'exec', '-it', '-u', 'node', '-e', 'HOME=/home/node', '-w', '/repo',
      '-e', 'ANTHROPIC_API_KEY=sk-test',
      'abc123',
      'bash', '-l', '-c', 'claude',
    ])
  })

  it('builds args for interactive shell (no command)', () => {
    const args = buildDockerExecArgs('abc123', '/repo', {})
    expect(args).toEqual([
      'exec', '-it', '-u', 'node', '-e', 'HOME=/home/node', '-w', '/repo',
      'abc123',
      'bash', '-l',
    ])
  })

  it('passes multiple env vars', () => {
    const args = buildDockerExecArgs('abc123', '/repo', { A: '1', B: '2' }, 'test')
    expect(args).toContain('-e')
    expect(args).toContain('A=1')
    expect(args).toContain('B=2')
  })

  it('handles empty env (only HOME is set)', () => {
    const args = buildDockerExecArgs('abc123', '/repo', {}, 'ls')
    // Only the built-in HOME=/home/node env var, no user-supplied ones
    expect(args.filter(a => a === '-e')).toHaveLength(1)
    expect(args).toContain('HOME=/home/node')
  })
})

describe('dockerSetupMessage', () => {
  it('includes the error message', () => {
    const msg = dockerSetupMessage({ available: false, error: 'Docker is not installed' })
    expect(msg).toContain('Docker is not installed')
  })

  it('includes install URLs when provided', () => {
    const msg = dockerSetupMessage({
      available: false,
      error: 'Not found',
      installUrl: 'https://docker.com/products/docker-desktop',
    })
    expect(msg).toContain('https://docker.com/products/docker-desktop')
  })

  it('includes setup instructions', () => {
    const msg = dockerSetupMessage({ available: false, error: 'test' })
    expect(msg).toContain('container isolation')
    expect(msg).toContain('repo settings')
  })

  it('handles missing error message', () => {
    const msg = dockerSetupMessage({ available: false })
    expect(msg).toContain('Docker is not available')
  })

  it('excludes install line when no URL provided', () => {
    const msg = dockerSetupMessage({ available: false, error: 'error' })
    expect(msg).not.toContain('Install:')
  })
})

describe('imageExists', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns true when image exists', async () => {
    mockExecFile.mockImplementation((_cmd: string, _args: string[], cb: (err: Error | null, result: { stdout: string }) => void) => {
      cb(null, { stdout: '[\n{}\n]' })
    })

    const result = await imageExists('node:22-slim')
    expect(result).toBe(true)
    expect(mockExecFile).toHaveBeenCalledWith(
      'docker',
      ['image', 'inspect', 'node:22-slim'],
      expect.any(Function),
    )
  })

  it('returns false when image does not exist', async () => {
    mockExecFile.mockImplementation((_cmd: string, _args: string[], cb: (err: Error | null) => void) => {
      cb(new Error('No such image'))
    })

    const result = await imageExists('nonexistent:latest')
    expect(result).toBe(false)
  })
})

describe('containerName', () => {
  it('generates deterministic name from repo path', () => {
    const name1 = containerName('/Users/rob/my-repo')
    const name2 = containerName('/Users/rob/my-repo')
    expect(name1).toBe(name2)
    expect(name1).toMatch(/^broomy-my-repo-[a-f0-9]{8}$/)
  })

  it('generates different names for different paths', () => {
    const name1 = containerName('/Users/rob/repo-a')
    const name2 = containerName('/Users/rob/repo-b')
    expect(name1).not.toBe(name2)
  })

  it('uses directory basename for readability', () => {
    const name = containerName('/Users/rob/projects/awesome-app')
    expect(name).toMatch(/^broomy-awesome-app-[a-f0-9]{8}$/)
  })

  it('sanitizes special characters', () => {
    const name = containerName('/Users/rob/My Project (v2)')
    expect(name).toMatch(/^broomy-my-project-v2-[a-f0-9]{8}$/)
  })
})

describe('setupContainer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('runs apt-get install and resolves on success', async () => {
    const mockChild = new EventEmitter() as EventEmitter & { stdout: EventEmitter; stderr: EventEmitter }
    mockChild.stdout = new EventEmitter()
    mockChild.stderr = new EventEmitter()
    mockSpawn.mockReturnValue(mockChild)

    const lines: string[] = []
    const promise = setupContainer('abc123', (line) => lines.push(line))

    mockChild.stdout.emit('data', Buffer.from('Reading package lists...\n'))
    mockChild.emit('close', 0)

    const result = await promise
    expect(result.success).toBe(true)
    expect(lines[0]).toContain('Installing system packages')
    // Completion is now silent (no "Container setup complete" line)
    expect(mockSpawn).toHaveBeenCalledWith(
      'docker',
      ['exec', 'abc123', 'bash', '-c', expect.stringContaining('apt-get update')],
      expect.any(Object),
    )
  })

  it('resolves with error on non-zero exit code', async () => {
    const mockChild = new EventEmitter() as EventEmitter & { stdout: EventEmitter; stderr: EventEmitter }
    mockChild.stdout = new EventEmitter()
    mockChild.stderr = new EventEmitter()
    mockSpawn.mockReturnValue(mockChild)

    const promise = setupContainer('abc123', () => {})
    mockChild.emit('close', 1)

    const result = await promise
    expect(result.success).toBe(false)
    expect(result.error).toContain('exited with code 1')
  })

  it('resolves with error on spawn failure', async () => {
    const mockChild = new EventEmitter() as EventEmitter & { stdout: EventEmitter; stderr: EventEmitter }
    mockChild.stdout = new EventEmitter()
    mockChild.stderr = new EventEmitter()
    mockSpawn.mockReturnValue(mockChild)

    const promise = setupContainer('abc123', () => {})
    mockChild.emit('error', new Error('ENOENT'))

    const result = await promise
    expect(result.success).toBe(false)
    expect(result.error).toBe('ENOENT')
  })
})

describe('ensureAgentInstalled', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns success if agent is already installed', async () => {
    mockExecFile.mockImplementation((_cmd: string, _args: string[], cb: (err: Error | null, result: { stdout: string }) => void) => {
      cb(null, { stdout: '/usr/local/bin/claude\n' })
    })

    const lines: string[] = []
    const result = await ensureAgentInstalled('abc123', 'claude', (line) => lines.push(line))
    expect(result.success).toBe(true)
    expect(lines).toHaveLength(0) // No install messages
  })

  it('installs agent when not found and resolves on success', async () => {
    // First call (which) fails, subsequent spawn succeeds
    mockExecFile.mockImplementation((_cmd: string, _args: string[], cb: (err: Error | null) => void) => {
      cb(new Error('not found'))
    })

    const mockChild = new EventEmitter() as EventEmitter & { stdout: EventEmitter; stderr: EventEmitter }
    mockChild.stdout = new EventEmitter()
    mockChild.stderr = new EventEmitter()
    mockSpawn.mockReturnValue(mockChild)

    const lines: string[] = []
    const promise = ensureAgentInstalled('abc123', 'claude', (line) => lines.push(line))

    // Wait for async to reach spawn point (past the awaited which check)
    await new Promise((r) => process.nextTick(r))

    mockChild.stdout.emit('data', Buffer.from('added 42 packages\n'))
    mockChild.emit('close', 0)

    const result = await promise
    expect(result.success).toBe(true)
    expect(lines[0]).toContain('Installing claude')
    // Claude installs as 'node' user since its installer writes to ~/.claude/local/
    expect(mockSpawn).toHaveBeenCalledWith(
      'docker',
      ['exec', '-u', 'node', '-e', 'HOME=/home/node', 'abc123', 'bash', '-c', 'curl -fsSL https://claude.ai/install.sh | bash'],
      expect.any(Object),
    )
  })

  it('returns success for unknown agents (skips install)', async () => {
    mockExecFile.mockImplementation((_cmd: string, _args: string[], cb: (err: Error | null) => void) => {
      cb(new Error('not found'))
    })

    const result = await ensureAgentInstalled('abc123', 'unknown-agent', () => {})
    expect(result.success).toBe(true)
    expect(mockSpawn).not.toHaveBeenCalled()
  })

  it('resolves with error when install fails', async () => {
    mockExecFile.mockImplementation((_cmd: string, _args: string[], cb: (err: Error | null) => void) => {
      cb(new Error('not found'))
    })

    const mockChild = new EventEmitter() as EventEmitter & { stdout: EventEmitter; stderr: EventEmitter }
    mockChild.stdout = new EventEmitter()
    mockChild.stderr = new EventEmitter()
    mockSpawn.mockReturnValue(mockChild)

    const promise = ensureAgentInstalled('abc123', 'codex', () => {})

    // Wait for async to reach spawn point
    await new Promise((r) => process.nextTick(r))

    mockChild.emit('close', 1)

    const result = await promise
    expect(result.success).toBe(false)
    expect(result.error).toContain('exited with code 1')
  })
})

describe('pullImage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('streams progress and resolves on success', async () => {
    const mockChild = new EventEmitter() as EventEmitter & { stdout: EventEmitter; stderr: EventEmitter }
    mockChild.stdout = new EventEmitter()
    mockChild.stderr = new EventEmitter()
    mockSpawn.mockReturnValue(mockChild)

    const lines: string[] = []
    const promise = pullImage('node:22-slim', (line) => lines.push(line))

    mockChild.stdout.emit('data', Buffer.from('Pulling from library/node\n'))
    mockChild.emit('close', 0)

    const result = await promise
    expect(result.success).toBe(true)
    expect(lines[0]).toContain('Pulling from library/node')
  })

  it('resolves with error on failure', async () => {
    const mockChild = new EventEmitter() as EventEmitter & { stdout: EventEmitter; stderr: EventEmitter }
    mockChild.stdout = new EventEmitter()
    mockChild.stderr = new EventEmitter()
    mockSpawn.mockReturnValue(mockChild)

    const promise = pullImage('node:22-slim', () => {})
    mockChild.emit('close', 1)

    const result = await promise
    expect(result.success).toBe(false)
    expect(result.error).toContain('exited with code 1')
  })
})

function createCtx(overrides: Partial<HandlerContext> = {}): HandlerContext {
  return {
    isE2ETest: false,
    e2eScenario: E2EScenario.Default,
    isDev: false,
    isWindows: false,
    ptyProcesses: new Map(),
    ptyOwnerWindows: new Map(),
    fileWatchers: new Map(),
    watcherOwnerWindows: new Map(),
    profileWindows: new Map(),
    mainWindow: null,
    E2E_MOCK_SHELL: undefined,
    FAKE_CLAUDE_SCRIPT: undefined,
    dockerContainers: new Map(),
    ...overrides,
  } as HandlerContext
}

describe('ensureContainer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reuses running container found by docker inspect', async () => {
    const ctx = createCtx()
    mockExecFile.mockImplementation((_cmd: string, args: string[], cb: (err: Error | null, result: { stdout: string }) => void) => {
      if (args[0] === 'inspect') {
        cb(null, { stdout: 'running\tabc123fullid' })
      } else {
        cb(null, { stdout: '' })
      }
    })

    const result = await ensureContainer(ctx, '/my/repo')
    expect(result.success).toBe(true)
    expect(result.containerId).toBe('abc123fullid')
    expect(result.isNew).toBe(false)
    expect(ctx.dockerContainers.get('/my/repo')).toBeDefined()
  })

  it('restarts exited container', async () => {
    const ctx = createCtx()
    const calls: string[][] = []
    mockExecFile.mockImplementation((_cmd: string, args: string[], cb: (err: Error | null, result: { stdout: string }) => void) => {
      calls.push(args)
      if (args[0] === 'inspect') {
        cb(null, { stdout: 'exited\tabc123fullid' })
      } else if (args[0] === 'start') {
        cb(null, { stdout: '' })
      } else {
        cb(null, { stdout: '' })
      }
    })

    const result = await ensureContainer(ctx, '/my/repo')
    expect(result.success).toBe(true)
    expect(result.isNew).toBe(false)
    // Should have called docker start
    expect(calls.some(c => c[0] === 'start')).toBe(true)
  })

  it('removes container in unknown state before creating new one', async () => {
    const ctx = createCtx()
    const calls: string[][] = []
    mockExecFile.mockImplementation((_cmd: string, args: string[], cb: (err: Error | null, result: { stdout: string }) => void) => {
      calls.push(args)
      if (args[0] === 'inspect') {
        // First inspect returns unknown state
        cb(null, { stdout: 'dead\tabc123' })
      } else if (args[0] === 'rm') {
        cb(null, { stdout: '' })
      } else if (args[0] === 'image' && args[1] === 'inspect') {
        // imageExists check
        cb(null, { stdout: '[]' })
      } else if (args[0] === 'run') {
        cb(null, { stdout: 'newidabc123' })
      } else {
        cb(null, { stdout: '' })
      }
    })

    const result = await ensureContainer(ctx, '/my/repo')
    expect(result.success).toBe(true)
    expect(result.isNew).toBe(true)
    // Should have called rm -f for the dead container
    expect(calls.some(c => c[0] === 'rm' && c.includes('-f'))).toBe(true)
  })

  it('creates new container when none exists', async () => {
    const ctx = createCtx()
    mockExecFile.mockImplementation((_cmd: string, args: string[], cb: (err: Error | null, result: { stdout: string }) => void) => {
      if (args[0] === 'inspect') {
        cb(new Error('No such container'), { stdout: '' })
      } else if (args[0] === 'image' && args[1] === 'inspect') {
        cb(null, { stdout: '[]' })
      } else if (args[0] === 'run') {
        cb(null, { stdout: 'newcontainerid' })
      } else {
        cb(null, { stdout: '' })
      }
    })

    const result = await ensureContainer(ctx, '/my/repo')
    expect(result.success).toBe(true)
    expect(result.containerId).toBe('newcontainerid')
    expect(result.isNew).toBe(true)
  })

  it('returns error when docker run fails', async () => {
    const ctx = createCtx()
    mockExecFile.mockImplementation((_cmd: string, args: string[], cb: (err: Error | null, result: { stdout: string }) => void) => {
      if (args[0] === 'inspect') {
        cb(new Error('No such container'), { stdout: '' })
      } else if (args[0] === 'image' && args[1] === 'inspect') {
        cb(null, { stdout: '[]' })
      } else if (args[0] === 'run') {
        cb(new Error('Conflict. The container name is already in use'), { stdout: '' })
      } else {
        cb(null, { stdout: '' })
      }
    })

    const result = await ensureContainer(ctx, '/my/repo')
    expect(result.success).toBe(false)
    expect(result.error).toContain('Conflict')
  })
})

describe('acquireSetupLock', () => {
  it('serializes concurrent calls for the same repo', async () => {
    const order: string[] = []

    const release1 = await acquireSetupLock('/test/lock-repo')
    order.push('acquired-1')

    // Second acquire should wait
    const promise2 = acquireSetupLock('/test/lock-repo').then((release) => {
      order.push('acquired-2')
      release()
    })

    // At this point, only first lock is acquired
    expect(order).toEqual(['acquired-1'])

    // Release first lock
    release1()

    // Wait for second to complete
    await promise2
    expect(order).toEqual(['acquired-1', 'acquired-2'])
  })

  it('allows concurrent locks for different repos', async () => {
    const release1 = await acquireSetupLock('/test/repo-a')
    const release2 = await acquireSetupLock('/test/repo-b')

    // Both acquired without blocking
    release1()
    release2()
  })
})

describe('constants', () => {
  it('has expected default image', () => {
    expect(DEFAULT_DOCKER_IMAGE).toBe('node:22-slim')
  })

  it('has container shells with bash as default', () => {
    expect(CONTAINER_SHELLS).toHaveLength(2)
    expect(CONTAINER_SHELLS[0]).toEqual({ path: '/bin/bash', name: 'Bash', isDefault: true })
    expect(CONTAINER_SHELLS[1]).toEqual({ path: '/bin/sh', name: 'sh', isDefault: false })
  })
})

describe('stopAllContainers', () => {
  it('stops all broomy containers and clears the map', async () => {
    const ctx = createCtx()
    ctx.dockerContainers.set('/repo1', { containerId: 'c1', repoDir: '/repo1', image: 'img' })

    // docker ps returns container ids
    mockExecFile.mockImplementation((_cmd: string, args: string[], cb: (err: Error | null, result: { stdout: string }) => void) => {
      if (args[0] === 'ps') {
        cb(null, { stdout: 'abc123\ndef456\n' })
      } else if (args[0] === 'stop') {
        cb(null, { stdout: '' })
      }
    })

    await stopAllContainers(ctx)

    expect(ctx.dockerContainers.size).toBe(0)
    // Should have called docker ps and docker stop
    expect(mockExecFile).toHaveBeenCalledWith('docker', ['ps', '-q', '--filter', 'name=broomy-'], expect.any(Function))
    expect(mockExecFile).toHaveBeenCalledWith('docker', ['stop', 'abc123', 'def456'], expect.any(Function))
  })

  it('handles no running containers gracefully', async () => {
    const ctx = createCtx()

    mockExecFile.mockImplementation((_cmd: string, _args: string[], cb: (err: Error | null, result: { stdout: string }) => void) => {
      cb(null, { stdout: '' })
    })

    await stopAllContainers(ctx)
    expect(ctx.dockerContainers.size).toBe(0)
  })
})
