// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import '../../../../test/react-setup'
import { useAgentStore } from '../../../store/agents'
import { AgentPickerView } from './AgentPickerView'

afterEach(() => {
  cleanup()
})

beforeEach(() => {
  vi.clearAllMocks()
  useAgentStore.setState({
    agents: [
      { id: 'agent-1', name: 'Claude', command: 'claude', color: '#4a9eff' },
      { id: 'agent-2', name: 'Copilot', command: 'copilot', color: '#22c55e' },
    ],
  })
  vi.mocked(window.agents.isInstalled).mockResolvedValue(true)
})

describe('AgentPickerView', () => {
  it('renders header with directory name', () => {
    render(
      <AgentPickerView
        directory="/repos/my-project/main"
        onBack={vi.fn()}
        onComplete={vi.fn()}
      />
    )
    expect(screen.getByText('Select Agent')).toBeTruthy()
    expect(screen.getByText('main')).toBeTruthy()
  })

  it('shows repoName when provided', () => {
    render(
      <AgentPickerView
        directory="/repos/my-project/main"
        repoName="My Project"
        onBack={vi.fn()}
        onComplete={vi.fn()}
      />
    )
    expect(screen.getByText('My Project')).toBeTruthy()
  })

  it('lists all agents', () => {
    render(
      <AgentPickerView
        directory="/repos/my-project"
        onBack={vi.fn()}
        onComplete={vi.fn()}
      />
    )
    expect(screen.getByText('Claude')).toBeTruthy()
    expect(screen.getByText('Copilot')).toBeTruthy()
  })

  it('shows Shell Only option', () => {
    render(
      <AgentPickerView
        directory="/repos/my-project"
        onBack={vi.fn()}
        onComplete={vi.fn()}
      />
    )
    expect(screen.getByText('Shell Only')).toBeTruthy()
    expect(screen.getByText('No agent, just a terminal')).toBeTruthy()
  })

  it('calls onComplete with agent when clicking an installed agent', async () => {
    const onComplete = vi.fn()
    render(
      <AgentPickerView
        directory="/repos/my-project"
        onBack={vi.fn()}
        onComplete={onComplete}
      />
    )
    // Wait for install check to finish and state to update
    await waitFor(() => {
      expect(window.agents.isInstalled).toHaveBeenCalled()
      // Ensure no "not installed" badges are shown (state has updated)
      expect(screen.queryAllByText('not installed')).toHaveLength(0)
    })
    fireEvent.click(screen.getByText('Claude'))
    expect(onComplete).toHaveBeenCalledWith('/repos/my-project', 'agent-1', undefined)
  })

  it('calls onComplete with null agentId for Shell Only', () => {
    const onComplete = vi.fn()
    render(
      <AgentPickerView
        directory="/repos/my-project"
        onBack={vi.fn()}
        onComplete={onComplete}
      />
    )
    fireEvent.click(screen.getByText('Shell Only'))
    expect(onComplete).toHaveBeenCalledWith('/repos/my-project', null, undefined)
  })

  it('calls onBack when Cancel is clicked', () => {
    const onBack = vi.fn()
    render(
      <AgentPickerView
        directory="/repos/my-project"
        onBack={onBack}
        onComplete={vi.fn()}
      />
    )
    fireEvent.click(screen.getByText('Cancel'))
    expect(onBack).toHaveBeenCalled()
  })

  it('shows warning for uninstalled agent on first click', async () => {
    vi.mocked(window.agents.isInstalled).mockResolvedValue(false)
    render(
      <AgentPickerView
        directory="/repos/my-project"
        onBack={vi.fn()}
        onComplete={vi.fn()}
      />
    )
    await waitFor(() => {
      expect(screen.getAllByText('not installed')).toHaveLength(2)
    })
    fireEvent.click(screen.getByText('Claude'))
    expect(screen.getByText(/was not found on your PATH/)).toBeTruthy()
  })

  it('shows install link for known agents when not installed', async () => {
    vi.mocked(window.agents.isInstalled).mockResolvedValue(false)
    render(
      <AgentPickerView
        directory="/repos/my-project"
        onBack={vi.fn()}
        onComplete={vi.fn()}
      />
    )
    await waitFor(() => {
      expect(screen.getAllByText('not installed')).toHaveLength(2)
    })
    fireEvent.click(screen.getByText('Claude'))
    expect(screen.getByText('Install Claude')).toBeTruthy()
  })

  it('does not show install link for unknown agents', async () => {
    useAgentStore.setState({
      agents: [
        { id: 'agent-x', name: 'Custom Agent', command: 'my-custom-tool', color: '#ff0000' },
      ],
    })
    vi.mocked(window.agents.isInstalled).mockResolvedValue(false)
    render(
      <AgentPickerView
        directory="/repos/my-project"
        onBack={vi.fn()}
        onComplete={vi.fn()}
      />
    )
    await waitFor(() => {
      expect(screen.getAllByText('not installed')).toHaveLength(1)
    })
    fireEvent.click(screen.getByText('Custom Agent'))
    expect(screen.getByText(/was not found on your PATH/)).toBeTruthy()
    expect(screen.getByText(/Install it first/)).toBeTruthy()
    expect(screen.queryByText('Install Custom Agent')).toBeNull()
  })

  it('opens external URL when install link is clicked', async () => {
    vi.mocked(window.agents.isInstalled).mockResolvedValue(false)
    render(
      <AgentPickerView
        directory="/repos/my-project"
        onBack={vi.fn()}
        onComplete={vi.fn()}
      />
    )
    await waitFor(() => {
      expect(screen.getAllByText('not installed')).toHaveLength(2)
    })
    fireEvent.click(screen.getByText('Claude'))
    fireEvent.click(screen.getByText('Install Claude'))
    expect(window.shell.openExternal).toHaveBeenCalledWith(
      'https://docs.anthropic.com/en/docs/claude-code/overview'
    )
  })

  it('shows no agents message when agents list is empty', () => {
    useAgentStore.setState({ agents: [] })
    render(
      <AgentPickerView
        directory="/repos/my-project"
        onBack={vi.fn()}
        onComplete={vi.fn()}
      />
    )
    expect(screen.getByText('No agents configured. Add agents in Settings.')).toBeTruthy()
  })

  it('passes repoId in extra when provided', () => {
    const onComplete = vi.fn()
    render(
      <AgentPickerView
        directory="/repos/my-project"
        repoId="repo-1"
        repoName="My Project"
        onBack={vi.fn()}
        onComplete={onComplete}
      />
    )
    fireEvent.click(screen.getByText('Shell Only'))
    expect(onComplete).toHaveBeenCalledWith('/repos/my-project', null, { repoId: 'repo-1', name: 'My Project' })
  })
})
