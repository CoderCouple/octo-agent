// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import '../../test/react-setup'
import { GitIdentitySetup, isIdentityError, isMergeModeError, isGitConfigError, IDENTITY_ERROR_MARKERS } from './GitIdentitySetup'

afterEach(() => {
  cleanup()
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('isIdentityError', () => {
  it('detects all identity error markers', () => {
    for (const marker of IDENTITY_ERROR_MARKERS) {
      expect(isIdentityError(`fatal: ${marker}`)).toBe(true)
    }
  })

  it('returns false for non-identity errors', () => {
    expect(isIdentityError('Authentication failed')).toBe(false)
    expect(isIdentityError('fatal: repository not found')).toBe(false)
  })
})

describe('isMergeModeError', () => {
  it('detects "Need to specify how to reconcile divergent branches"', () => {
    expect(isMergeModeError('fatal: Need to specify how to reconcile divergent branches.')).toBe(true)
  })

  it('detects "pull.rebase"', () => {
    expect(isMergeModeError('hint: You can set pull.rebase to true')).toBe(true)
  })

  it('returns false for non-merge-mode errors', () => {
    expect(isMergeModeError('Authentication failed')).toBe(false)
  })
})

describe('isGitConfigError', () => {
  it('returns true for identity errors', () => {
    expect(isGitConfigError('Please tell me who you are')).toBe(true)
  })

  it('returns true for merge mode errors', () => {
    expect(isGitConfigError('Need to specify how to reconcile divergent branches')).toBe(true)
  })

  it('returns false for other errors', () => {
    expect(isGitConfigError('fatal: repository not found')).toBe(false)
  })
})

describe('GitIdentitySetup', () => {
  it('shows nothing when there is no error', () => {
    const { container } = render(
      <GitIdentitySetup error={null} onRetry={vi.fn()} />
    )
    expect(container.textContent).toBe('')
  })

  it('shows nothing for non-identity errors', () => {
    const { container } = render(
      <GitIdentitySetup error="fatal: repository not found" onRetry={vi.fn()} />
    )
    expect(container.textContent).toBe('')
  })

  it('shows identity form for identity errors', () => {
    render(
      <GitIdentitySetup error="Please tell me who you are" onRetry={vi.fn()} />
    )
    expect(screen.getByPlaceholderText('Your Name')).toBeTruthy()
    expect(screen.getByPlaceholderText('you@example.com')).toBeTruthy()
    expect(screen.getByText('Save Git Identity')).toBeTruthy()
  })

  it('shows merge mode setup for merge mode errors', () => {
    render(
      <GitIdentitySetup error="Need to specify how to reconcile divergent branches" onRetry={vi.fn()} />
    )
    expect(screen.getByText('Set Default Merge Mode')).toBeTruthy()
  })

  it('pre-populates name and email from git config', async () => {
    vi.mocked(window.git.getConfig).mockImplementation((_path, key) => {
      if (key === 'user.name') return Promise.resolve('Test User')
      if (key === 'user.email') return Promise.resolve('test@example.com')
      return Promise.resolve(null)
    })

    render(
      <GitIdentitySetup error="Please tell me who you are" onRetry={vi.fn()} />
    )

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Your Name')).toHaveProperty('value', 'Test User')
      expect(screen.getByPlaceholderText('you@example.com')).toHaveProperty('value', 'test@example.com')
    })
  })

  it('saves identity and shows success with retry button', async () => {
    vi.mocked(window.git.setGlobalConfig).mockResolvedValue({ success: true })

    const onRetry = vi.fn()
    render(
      <GitIdentitySetup error="Please tell me who you are" onRetry={onRetry} retryLabel="Retry Clone" />
    )

    fireEvent.change(screen.getByPlaceholderText('Your Name'), { target: { value: 'Alice' } })
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: 'alice@example.com' } })
    fireEvent.click(screen.getByText('Save Git Identity'))

    await waitFor(() => {
      expect(window.git.setGlobalConfig).toHaveBeenCalledWith('user.name', 'Alice')
      expect(window.git.setGlobalConfig).toHaveBeenCalledWith('user.email', 'alice@example.com')
      expect(window.git.setGlobalConfig).toHaveBeenCalledWith('pull.rebase', 'false')
      expect(screen.getByText('Git identity configured.')).toBeTruthy()
      expect(screen.getByText('Retry Clone')).toBeTruthy()
    })

    fireEvent.click(screen.getByText('Retry Clone'))
    expect(onRetry).toHaveBeenCalled()
  })

  it('shows validation error when name or email is empty', async () => {
    render(
      <GitIdentitySetup error="Please tell me who you are" onRetry={vi.fn()} />
    )

    // Save button should be disabled when inputs are empty
    const saveBtn = screen.getByText('Save Git Identity')
    expect(saveBtn.hasAttribute('disabled')).toBe(true)
  })

  it('saves merge mode config for merge mode errors', async () => {
    vi.mocked(window.git.setGlobalConfig).mockResolvedValue({ success: true })

    render(
      <GitIdentitySetup error="Need to specify how to reconcile divergent branches" onRetry={vi.fn()} />
    )

    fireEvent.click(screen.getByText('Set Default Merge Mode'))

    await waitFor(() => {
      expect(window.git.setGlobalConfig).toHaveBeenCalledWith('pull.rebase', 'false')
      expect(screen.getByText('Default merge mode configured.')).toBeTruthy()
    })
  })

  it('shows error when save fails', async () => {
    vi.mocked(window.git.setGlobalConfig).mockResolvedValue({ success: false, error: 'Permission denied' })

    render(
      <GitIdentitySetup error="Please tell me who you are" onRetry={vi.fn()} />
    )

    fireEvent.change(screen.getByPlaceholderText('Your Name'), { target: { value: 'Alice' } })
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: 'alice@test.com' } })
    fireEvent.click(screen.getByText('Save Git Identity'))

    await waitFor(() => {
      expect(screen.getByText('Permission denied')).toBeTruthy()
    })
  })
})
