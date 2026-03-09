import { describe, it, expect } from 'vitest'
import { getCloneErrorHint, getGitAuthHint } from './cloneErrorHint'

describe('getCloneErrorHint', () => {
  describe('HTTPS auth errors with HTTPS URL', () => {
    const httpsUrl = 'https://github.com/user/repo'

    it('detects "could not read Username" and suggests SSH URL', () => {
      const hint = getCloneErrorHint('fatal: could not read Username for \'https://github.com\': Device not configured', httpsUrl)
      expect(hint).toContain('could not authenticate over HTTPS')
      expect(hint).toContain('git@github.com:user/repo.git')
      expect(hint).toContain('gh auth setup-git')
    })

    it('detects "Authentication failed"', () => {
      const hint = getCloneErrorHint('fatal: Authentication failed for \'https://github.com/user/repo\'', httpsUrl)
      expect(hint).toContain('could not authenticate over HTTPS')
      expect(hint).toContain('git@github.com:user/repo.git')
    })

    it('detects "terminal prompts disabled"', () => {
      const hint = getCloneErrorHint('fatal: terminal prompts disabled', httpsUrl)
      expect(hint).toContain('could not authenticate over HTTPS')
    })

    it('handles HTTPS URL with .git suffix', () => {
      const hint = getCloneErrorHint('fatal: could not read Username', 'https://github.com/user/repo.git')
      expect(hint).toContain('git@github.com:user/repo.git')
    })

    it('handles http:// URL', () => {
      const hint = getCloneErrorHint('fatal: could not read Username', 'http://github.com/user/repo')
      expect(hint).toContain('git@github.com:user/repo.git')
    })

    it('omits SSH URL suggestion for non-GitHub HTTPS URLs', () => {
      const hint = getCloneErrorHint('fatal: could not read Username', 'https://gitlab.com/user/repo')
      expect(hint).toContain('could not authenticate over HTTPS')
      expect(hint).not.toContain('git@github.com')
      expect(hint).toContain('gh auth setup-git')
    })
  })

  describe('SSH auth errors with SSH URL', () => {
    const sshUrl = 'git@github.com:user/repo.git'

    it('detects "Permission denied (publickey)" and suggests HTTPS URL', () => {
      const hint = getCloneErrorHint('git@github.com: Permission denied (publickey).', sshUrl)
      expect(hint).toContain('could not authenticate over SSH')
      expect(hint).toContain('https://github.com/user/repo.git')
      expect(hint).toContain('ssh -T git@github.com')
    })

    it('detects "Host key verification failed" with host-key-specific hint', () => {
      const hint = getCloneErrorHint('Host key verification failed.', sshUrl)
      expect(hint).toContain('SSH host key is not yet trusted')
      expect(hint).toContain('ssh -T git@github.com')
      expect(hint).toContain('type "yes"')
      expect(hint).toContain('https://github.com/user/repo.git')
      expect(hint).toContain('gh auth login')
    })

    it('detects "Connection refused" with SSH URL', () => {
      const hint = getCloneErrorHint('ssh: connect to host github.com port 22: Connection refused', sshUrl)
      expect(hint).toContain('could not authenticate over SSH')
    })

    it('detects "Connection timed out" with SSH URL', () => {
      const hint = getCloneErrorHint('ssh: connect to host github.com port 22: Connection timed out', sshUrl)
      expect(hint).toContain('could not authenticate over SSH')
    })

    it('handles SSH URL without .git suffix', () => {
      const hint = getCloneErrorHint('Permission denied (publickey)', 'git@github.com:user/repo')
      expect(hint).toContain('https://github.com/user/repo.git')
    })

    it('handles ssh:// protocol URL', () => {
      const hint = getCloneErrorHint('Permission denied (publickey)', 'ssh://git@github.com/user/repo')
      expect(hint).toContain('could not authenticate over SSH')
    })

    it('omits HTTPS URL suggestion for non-GitHub SSH URLs', () => {
      const hint = getCloneErrorHint('Permission denied (publickey)', 'git@gitlab.com:user/repo.git')
      expect(hint).toContain('could not authenticate over SSH')
      expect(hint).not.toContain('https://github.com')
      expect(hint).toContain('ssh -T git@github.com')
    })
  })

  describe('HTTPS auth errors when gh is not available', () => {
    const httpsUrl = 'https://github.com/user/repo'

    it('suggests installing gh CLI instead of running gh auth', () => {
      const hint = getCloneErrorHint('fatal: could not read Username', httpsUrl, { ghAvailable: false })
      expect(hint).toContain('Install GitHub CLI (cli.github.com)')
      expect(hint).not.toContain('gh auth setup-git')
    })

    it('still suggests SSH URL when gh unavailable', () => {
      const hint = getCloneErrorHint('fatal: could not read Username', httpsUrl, { ghAvailable: false })
      expect(hint).toContain('git@github.com:user/repo.git')
    })
  })

  describe('SSH host key errors', () => {
    const sshUrl = 'git@github.com:user/repo.git'

    it('suggests installing gh CLI when gh is not available', () => {
      const hint = getCloneErrorHint('Host key verification failed.', sshUrl, { ghAvailable: false })
      expect(hint).toContain('SSH host key is not yet trusted')
      expect(hint).toContain('Install GitHub CLI')
      expect(hint).not.toContain('Run "gh auth login"')
    })

    it('omits HTTPS URL for non-GitHub SSH URLs', () => {
      const hint = getCloneErrorHint('Host key verification failed.', 'git@gitlab.com:user/repo.git')
      expect(hint).toContain('SSH host key is not yet trusted')
      expect(hint).not.toContain('https://github.com')
    })
  })

  describe('SSH auth errors when gh is not available', () => {
    const sshUrl = 'git@github.com:user/repo.git'

    it('suggests installing gh CLI instead of running gh auth', () => {
      const hint = getCloneErrorHint('Permission denied (publickey)', sshUrl, { ghAvailable: false })
      expect(hint).toContain('Install GitHub CLI (cli.github.com)')
      expect(hint).not.toContain('Run "gh auth setup-git"')
    })

    it('still suggests HTTPS URL when gh unavailable', () => {
      const hint = getCloneErrorHint('Permission denied (publickey)', sshUrl, { ghAvailable: false })
      expect(hint).toContain('https://github.com/user/repo.git')
    })
  })

  describe('gh available hints unchanged', () => {
    it('keeps gh auth suggestion when ghAvailable is true', () => {
      const hint = getCloneErrorHint('fatal: could not read Username', 'https://github.com/user/repo', { ghAvailable: true })
      expect(hint).toContain('gh auth setup-git')
    })

    it('keeps gh auth suggestion when ghAvailable is undefined', () => {
      const hint = getCloneErrorHint('fatal: could not read Username', 'https://github.com/user/repo')
      expect(hint).toContain('gh auth setup-git')
    })
  })

  describe('no hint for unrelated errors', () => {
    it('returns null for repository not found', () => {
      expect(getCloneErrorHint('fatal: repository not found', 'https://github.com/user/repo')).toBeNull()
    })

    it('returns null for generic errors', () => {
      expect(getCloneErrorHint('fatal: something went wrong', 'git@github.com:user/repo.git')).toBeNull()
    })
  })

  describe('getGitAuthHint identity errors', () => {
    it('returns hint for "Please tell me who you are"', () => {
      const hint = getGitAuthHint("fatal: Please tell me who you are.\n\nRun\n  git config --global user.email")
      expect(hint).toContain('Git identity not configured')
      expect(hint).toContain('git config --global user.name')
      expect(hint).toContain('git config --global user.email')
    })

    it('returns hint for "Author identity unknown"', () => {
      const hint = getGitAuthHint('Author identity unknown')
      expect(hint).toContain('Git identity not configured')
    })

    it('returns hint for "empty ident name"', () => {
      const hint = getGitAuthHint('fatal: empty ident name (for <user@host>) not allowed')
      expect(hint).toContain('Git identity not configured')
    })

    it('returns hint for "user.useConfigOnly"', () => {
      const hint = getGitAuthHint('fatal: user.useConfigOnly set but no name given')
      expect(hint).toContain('Git identity not configured')
    })

    it('returns hint for merge mode errors', () => {
      const hint = getGitAuthHint('fatal: Need to specify how to reconcile divergent branches.\nhint: You can do so by running one of the following commands:\nhint:   git config pull.rebase false  # merge\nhint:   git config pull.ff only       # fast-forward only')
      expect(hint).toContain('Git default merge mode not configured')
      expect(hint).toContain('git config --global pull.rebase false')
    })
  })

  describe('getGitAuthHint without URL', () => {
    it('returns hint for "could not read Username" without URL', () => {
      const hint = getGitAuthHint('fatal: could not read Username for \'https://github.com\': terminal prompts disabled')
      expect(hint).toContain('Git authentication failed')
      expect(hint).toContain('gh auth login')
    })

    it('returns hint for "Authentication failed" without URL', () => {
      const hint = getGitAuthHint('fatal: Authentication failed')
      expect(hint).toContain('Git authentication failed')
    })

    it('returns hint for "Permission denied (publickey)" without URL', () => {
      const hint = getGitAuthHint('Permission denied (publickey)')
      expect(hint).toContain('Git authentication failed')
    })

    it('returns hint for "terminal prompts disabled" without URL', () => {
      const hint = getGitAuthHint('fatal: terminal prompts disabled')
      expect(hint).toContain('Git authentication failed')
    })

    it('returns hint for "Host key verification failed" without URL', () => {
      const hint = getGitAuthHint('Host key verification failed.')
      expect(hint).toContain('Git authentication failed')
    })

    it('suggests installing gh CLI when ghAvailable is false', () => {
      const hint = getGitAuthHint('fatal: could not read Username', { ghAvailable: false })
      expect(hint).toContain('Install GitHub CLI')
      expect(hint).not.toContain('gh auth login')
    })

    it('suggests gh auth login when ghAvailable is true', () => {
      const hint = getGitAuthHint('fatal: could not read Username', { ghAvailable: true })
      expect(hint).toContain('gh auth login')
    })

    it('returns null for non-auth errors', () => {
      expect(getGitAuthHint('fatal: repository not found')).toBeNull()
      expect(getGitAuthHint('ENOTFOUND github.com')).toBeNull()
    })

    it('delegates to getCloneErrorHint when URL is provided', () => {
      const hint = getGitAuthHint('fatal: could not read Username', { url: 'https://github.com/user/repo' })
      expect(hint).toContain('could not authenticate over HTTPS')
      expect(hint).toContain('git@github.com:user/repo.git')
    })
  })

  describe('no hint when URL type does not match error type', () => {
    it('returns null for HTTPS auth error with SSH URL', () => {
      expect(getCloneErrorHint('fatal: could not read Username', 'git@github.com:user/repo.git')).toBeNull()
    })

    it('returns null for SSH auth error with HTTPS URL', () => {
      expect(getCloneErrorHint('Permission denied (publickey)', 'https://github.com/user/repo')).toBeNull()
    })

    it('returns null for "Connection refused" with HTTPS URL (not SSH-specific)', () => {
      expect(getCloneErrorHint('Connection refused', 'https://github.com/user/repo')).toBeNull()
    })
  })
})
