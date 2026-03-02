// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import '../../test/react-setup'
import Terminal from './Terminal'

// Mock the useTerminalSetup hook to avoid xterm.js issues in jsdom
vi.mock('../hooks/useTerminalSetup', () => ({
  useTerminalSetup: vi.fn().mockReturnValue({
    terminalRef: { current: null },
    ptyIdRef: { current: 'pty-123' },
    showScrollButton: false,
    handleScrollToBottom: vi.fn(),
  }),
}))

// Mock the xterm CSS import
vi.mock('@xterm/xterm/css/xterm.css', () => ({}))

// Mock agentInstallUrls
vi.mock('../utils/agentInstallUrls', () => ({
  getAgentInstallUrl: (cmd: string) => {
    if (cmd === 'claude') return 'https://docs.anthropic.com/en/docs/claude-code/overview'
    return null
  },
}))

afterEach(() => {
  cleanup()
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('Terminal', () => {
  it('renders placeholder when no sessionId provided', () => {
    render(<Terminal cwd="/tmp/test" />)
    expect(screen.getByText('Select a session to view terminal')).toBeTruthy()
  })

  it('renders terminal container when sessionId is provided', () => {
    const { container } = render(
      <Terminal sessionId="session-1" cwd="/tmp/test" />
    )
    expect(container.querySelector('.h-full.w-full.flex.flex-col')).toBeTruthy()
  })

  it('does not show scroll button when showScrollButton is false', () => {
    render(<Terminal sessionId="session-1" cwd="/tmp/test" />)
    expect(screen.queryByText(/Go to End/)).toBeNull()
  })

  it('shows scroll button when showScrollButton is true', async () => {
    const { useTerminalSetup } = await import('../hooks/useTerminalSetup')
    vi.mocked(useTerminalSetup).mockReturnValue({
      terminalRef: { current: null },
      ptyIdRef: { current: 'pty-123' },
      showScrollButton: true,
      handleScrollToBottom: vi.fn(),
    })
    render(<Terminal sessionId="session-1" cwd="/tmp/test" />)
    expect(screen.getByText(/Go to End/)).toBeTruthy()
  })

  it('calls handleScrollToBottom when scroll button is clicked', async () => {
    const handleScrollToBottom = vi.fn()
    const { useTerminalSetup } = await import('../hooks/useTerminalSetup')
    vi.mocked(useTerminalSetup).mockReturnValue({
      terminalRef: { current: null },
      ptyIdRef: { current: 'pty-123' },
      showScrollButton: true,
      handleScrollToBottom,
    })
    render(<Terminal sessionId="session-1" cwd="/tmp/test" />)
    fireEvent.click(screen.getByText(/Go to End/))
    expect(handleScrollToBottom).toHaveBeenCalled()
  })

  it('shows context menu with copy and paste options', async () => {
    vi.mocked(window.menu.popup).mockResolvedValue(null)
    render(<Terminal sessionId="session-1" cwd="/tmp/test" />)
    const terminalDiv = document.querySelector('.h-full.w-full.flex.flex-col')!
    fireEvent.contextMenu(terminalDiv)
    expect(window.menu.popup).toHaveBeenCalled()
    const menuItems = vi.mocked(window.menu.popup).mock.calls[0][0]
    expect(menuItems.some((item: { id: string }) => item.id === 'copy')).toBe(true)
    expect(menuItems.some((item: { id: string }) => item.id === 'paste')).toBe(true)
  })

  it('includes restart option in context menu for agent terminals', async () => {
    vi.mocked(window.menu.popup).mockResolvedValue(null)
    render(<Terminal sessionId="session-1" cwd="/tmp/test" isAgentTerminal={true} />)
    const terminalDiv = document.querySelector('.h-full.w-full.flex.flex-col')!
    fireEvent.contextMenu(terminalDiv)
    const menuItems = vi.mocked(window.menu.popup).mock.calls[0][0]
    expect(menuItems.some((item: { id: string }) => item.id === 'restart-agent')).toBe(true)
  })

  it('does not include restart option for non-agent terminals', async () => {
    vi.mocked(window.menu.popup).mockResolvedValue(null)
    render(<Terminal sessionId="session-1" cwd="/tmp/test" isAgentTerminal={false} />)
    const terminalDiv = document.querySelector('.h-full.w-full.flex.flex-col')!
    fireEvent.contextMenu(terminalDiv)
    const menuItems = vi.mocked(window.menu.popup).mock.calls[0][0]
    expect(menuItems.some((item: { id: string }) => item.id === 'restart-agent')).toBe(false)
  })

  it('passes config to useTerminalSetup', async () => {
    const { useTerminalSetup } = await import('../hooks/useTerminalSetup')
    render(
      <Terminal
        sessionId="session-1"
        cwd="/tmp/test"
        command="echo hello"
        isAgentTerminal={true}
        isActive={true}
      />
    )
    expect(useTerminalSetup).toHaveBeenCalled()
    const config = vi.mocked(useTerminalSetup).mock.calls[0][0]
    expect(config.sessionId).toBe('session-1')
    expect(config.cwd).toBe('/tmp/test')
    expect(config.command).toBe('echo hello')
    expect(config.isAgentTerminal).toBe(true)
    expect(config.isActive).toBe(true)
  })

  it('does not show not-installed banner when agent is installed', () => {
    render(<Terminal sessionId="session-1" cwd="/tmp/test" command="claude" agentNotInstalled={false} />)
    expect(screen.queryByText(/is not installed/)).toBeNull()
  })

  it('shows not-installed banner when agentNotInstalled is true', () => {
    render(<Terminal sessionId="session-1" cwd="/tmp/test" command="claude" agentNotInstalled={true} />)
    expect(screen.getByText(/is not installed/)).toBeTruthy()
  })

  it('shows install link for known agent commands', () => {
    render(<Terminal sessionId="session-1" cwd="/tmp/test" command="claude" agentNotInstalled={true} />)
    const installButton = screen.getByText(/Install/)
    expect(installButton.tagName).toBe('BUTTON')
  })

  it('opens external URL when install link is clicked', () => {
    render(<Terminal sessionId="session-1" cwd="/tmp/test" command="claude" agentNotInstalled={true} />)
    fireEvent.click(screen.getByText(/Install/))
    expect(window.shell.openExternal).toHaveBeenCalledWith('https://docs.anthropic.com/en/docs/claude-code/overview')
  })

  it('shows fallback text for unknown agent commands', () => {
    render(<Terminal sessionId="session-1" cwd="/tmp/test" command="unknown-agent" agentNotInstalled={true} />)
    expect(screen.getByText(/Install it to use this agent/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Install/ })).toBeNull()
  })
})
