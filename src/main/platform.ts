/**
 * Cross-platform shell and path utilities.
 *
 * Provides OS detection flags, default shell resolution (respecting the SHELL
 * environment variable on Unix, ComSpec on Windows), path normalization to
 * forward slashes, and a chmod helper that is a no-op on Windows.
 */
import { chmodSync, existsSync } from 'fs'
import { execFileSync } from 'child_process'

export const isWindows = process.platform === 'win32'
export const isMac = process.platform === 'darwin'

export type ShellOption = {
  path: string    // Executable path or name used to spawn the shell
  name: string    // Human-readable label shown in the UI
  isDefault: boolean
}

export function getDefaultShell(): string {
  if (isWindows) return process.env.ComSpec || 'powershell.exe'
  return process.env.SHELL || '/bin/sh'
}

/** Check if a command exists on PATH (cross-platform). */
function whichSync(cmd: string): string | null {
  try {
    const result = isWindows
      ? execFileSync('where', [cmd], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim().split('\n')[0].trim()
      : execFileSync('which', [cmd], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    return result || null
  } catch {
    return null
  }
}

/**
 * Detect shells available on the current platform.
 * Returns them in a stable order; the system default is marked isDefault=true.
 */
export function getAvailableShells(): ShellOption[] {
  const systemDefault = getDefaultShell()
  const shells: ShellOption[] = []
  const seen = new Set<string>()

  function add(path: string, name: string) {
    if (!seen.has(path)) {
      seen.add(path)
      shells.push({ path, name, isDefault: path === systemDefault || path.toLowerCase() === systemDefault.toLowerCase() })
    }
  }

  if (isWindows) {
    // PowerShell Core (pwsh) — check first so it appears before legacy powershell
    const pwsh = whichSync('pwsh') ?? whichSync('pwsh.exe')
    if (pwsh) add(pwsh, 'PowerShell Core (pwsh)')

    // Windows PowerShell
    const ps = whichSync('powershell') ?? whichSync('powershell.exe') ?? 'powershell.exe'
    add(ps, 'Windows PowerShell')

    // Command Prompt
    const cmd = process.env.ComSpec || 'cmd.exe'
    add(cmd, 'Command Prompt (cmd)')

    // Git Bash — common install locations
    const gitBashPaths = [
      'C:\\Program Files\\Git\\bin\\bash.exe',
      'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
    ]
    const gitBash = gitBashPaths.find(existsSync) ?? whichSync('bash')
    if (gitBash) add(gitBash, 'Git Bash')

    // WSL
    const wsl = whichSync('wsl') ?? whichSync('wsl.exe')
    if (wsl) add(wsl, 'WSL (wsl.exe)')
  } else {
    // Always include the user's login shell first
    const loginShell = process.env.SHELL || '/bin/sh'
    const loginName = loginShell.split('/').pop() ?? loginShell
    add(loginShell, `${loginName} (login shell)`)

    // Other common shells
    const candidates: [string, string][] = [
      ['/bin/zsh', 'Zsh'],
      ['/bin/bash', 'Bash'],
      ['/usr/bin/bash', 'Bash'],
      ['/usr/local/bin/fish', 'Fish'],
      ['/usr/bin/fish', 'Fish'],
      ['/bin/sh', 'sh'],
    ]
    for (const [path, name] of candidates) {
      if (existsSync(path)) add(path, name)
    }

    // Also check PATH for fish if not found at standard paths
    const fishPath = whichSync('fish')
    if (fishPath) add(fishPath, 'Fish')
  }

  // If the current system default wasn't captured above, prepend it
  if (!seen.has(systemDefault)) {
    shells.unshift({ path: systemDefault, name: systemDefault, isDefault: true })
  }

  // Ensure exactly one shell is marked as default
  let hasDefault = shells.some((s) => s.isDefault)
  if (!hasDefault && shells.length > 0) {
    shells[0] = { ...shells[0], isDefault: true }
    hasDefault = true
  }

  return shells
}

export function getExecShell(): string | undefined {
  if (isWindows) return undefined // Node defaults to cmd.exe
  // Prefer the user's configured shell, fall back to POSIX sh
  return process.env.SHELL || '/bin/sh'
}

export function normalizePath(p: string): string {
  return p.replace(/\\/g, '/')
}

export function makeExecutable(filePath: string): void {
  if (!isWindows) {
    chmodSync(filePath, 0o755)
  }
}
