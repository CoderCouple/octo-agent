// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import '../../../../../test/react-setup'

vi.mock('../../../../features/commands/commandsConfig', async () => {
  const actual = await vi.importActual('../../../../features/commands/commandsConfig')
  return {
    ...actual,
    checkLegacyOctoAgentGitignore: vi.fn().mockResolvedValue(false),
    removeLegacyOctoAgentGitignore: vi.fn().mockResolvedValue(undefined),
  }
})

import { CommandsSetupDialog } from './CommandsSetupDialog'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(window.fs.mkdir).mockResolvedValue({ success: true })
  vi.mocked(window.fs.writeFile).mockResolvedValue({ success: true })
  vi.mocked(window.fs.exists).mockResolvedValue(false)
})
afterEach(() => { cleanup() })

describe('CommandsSetupDialog', () => {
  it('renders dialog title and description', () => {
    render(<CommandsSetupDialog directory="/repo" onClose={vi.fn()} onCreated={vi.fn()} />)
    expect(screen.getByText('Set up OctoAgent Actions')).toBeTruthy()
    expect(screen.getByText(/defines the actions/)).toBeTruthy()
  })

  it('renders Cancel and Create buttons', () => {
    render(<CommandsSetupDialog directory="/repo" onClose={vi.fn()} onCreated={vi.fn()} />)
    expect(screen.getByText('Cancel')).toBeTruthy()
    expect(screen.getByText('Create default commands.json')).toBeTruthy()
  })

  it('calls onClose when Cancel is clicked', () => {
    const onClose = vi.fn()
    render(<CommandsSetupDialog directory="/repo" onClose={onClose} onCreated={vi.fn()} />)
    fireEvent.click(screen.getByText('Cancel'))
    expect(onClose).toHaveBeenCalled()
  })

  it('creates files and calls onCreated when Create is clicked', async () => {
    const onClose = vi.fn()
    const onCreated = vi.fn()

    render(<CommandsSetupDialog directory="/repo" onClose={onClose} onCreated={onCreated} />)

    await act(async () => {
      fireEvent.click(screen.getByText('Create default commands.json'))
    })

    // Should have created commands.json
    expect(window.fs.writeFile).toHaveBeenCalledWith(
      '/repo/.octoagent/commands.json',
      expect.any(String)
    )
    expect(onCreated).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('shows legacy gitignore warning when detected', async () => {
    const mod = await import('../../../../features/commands/commandsConfig')
    vi.mocked(mod.checkLegacyOctoAgentGitignore).mockResolvedValue(true)

    const { unmount } = render(<CommandsSetupDialog directory="/repo" onClose={vi.fn()} onCreated={vi.fn()} />)

    // The effect runs async, wait for re-render
    await act(async () => {
      await new Promise(r => setTimeout(r, 10))
    })

    expect(screen.getByText(/currently ignores/)).toBeTruthy()
    unmount()
  })

  it('removes legacy gitignore when creating and legacy is detected', async () => {
    const mod = await import('../../../../features/commands/commandsConfig')
    vi.mocked(mod.checkLegacyOctoAgentGitignore).mockResolvedValue(true)

    const onCreated = vi.fn()
    render(<CommandsSetupDialog directory="/repo" onClose={vi.fn()} onCreated={onCreated} />)

    await act(async () => {
      await new Promise(r => setTimeout(r, 10))
    })

    await act(async () => {
      fireEvent.click(screen.getByText('Create default commands.json'))
    })

    expect(mod.removeLegacyOctoAgentGitignore).toHaveBeenCalledWith('/repo')
    expect(onCreated).toHaveBeenCalled()
  })

  it('shows Creating... text and recovers on error', async () => {
    vi.mocked(window.fs.mkdir).mockRejectedValue(new Error('fail'))

    render(<CommandsSetupDialog directory="/repo" onClose={vi.fn()} onCreated={vi.fn()} />)

    await act(async () => {
      fireEvent.click(screen.getByText('Create default commands.json'))
    })

    // Button should be re-enabled after error
    expect(screen.getByText('Create default commands.json')).toBeTruthy()
  })

  it('closes backdrop on click', () => {
    const onClose = vi.fn()
    const { container } = render(<CommandsSetupDialog directory="/repo" onClose={onClose} onCreated={vi.fn()} />)
    // Click the backdrop (outer div)
    fireEvent.click(container.querySelector('.fixed')!)
    expect(onClose).toHaveBeenCalled()
  })
})
