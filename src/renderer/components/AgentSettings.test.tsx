// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import '../../test/react-setup'
import AgentSettings from './AgentSettings'
import { useAgentStore } from '../store/agents'
import { useRepoStore } from '../store/repos'

// Mock child components to keep tests focused on AgentSettings itself
vi.mock('./AgentSettingsAgentTab', () => ({
  AgentSettingsAgentTab: (props: Record<string, unknown>) => (
    <div data-testid="agent-tab">
      <span data-testid="agent-tab-editing-id">{String(props.editingId ?? '')}</span>
      <span data-testid="agent-tab-show-add">{String(props.showAddForm)}</span>
      <span data-testid="agent-tab-name">{String(props.name ?? '')}</span>
      <span data-testid="agent-tab-command">{String(props.command ?? '')}</span>
      <span data-testid="agent-tab-skip-flag">{String(props.skipApprovalFlag ?? '')}</span>
      <button data-testid="agent-tab-show-add-form" onClick={props.onShowAddForm as () => void}>Show Add</button>
      <button data-testid="agent-tab-cancel" onClick={props.onCancel as () => void}>Cancel</button>
      <button data-testid="agent-tab-add" onClick={props.onAdd as () => void}>Add</button>
      <button data-testid="agent-tab-update" onClick={props.onUpdate as () => void}>Update</button>
      <button data-testid="agent-tab-edit" onClick={() => (props.onEdit as (a: Record<string, unknown>) => void)({ id: 'agent-1', name: 'Claude', command: 'claude', skipApprovalFlag: '--flag' })}>Edit</button>
      <button data-testid="agent-tab-delete" onClick={() => (props.onDelete as (id: string) => void)('agent-1')}>Delete</button>
      <input data-testid="agent-tab-name-input" onChange={(e) => (props.onNameChange as (v: string) => void)(e.target.value)} />
      <input data-testid="agent-tab-cmd-input" onChange={(e) => (props.onCommandChange as (v: string) => void)(e.target.value)} />
      <input data-testid="agent-tab-flag-input" onChange={(e) => (props.onSkipApprovalFlagChange as (v: string) => void)(e.target.value)} />
    </div>
  ),
}))

vi.mock('./AgentSettingsRepoTab', () => ({
  AgentSettingsRepoTab: (props: Record<string, unknown>) => (
    <div data-testid="repo-tab">
      <span data-testid="repo-tab-editing-id">{String(props.editingRepoId ?? '')}</span>
      <button data-testid="repo-tab-edit" onClick={() => (props.onEditRepo as (id: string) => void)('repo-1')}>Edit Repo</button>
    </div>
  ),
}))

afterEach(() => {
  cleanup()
})

beforeEach(() => {
  vi.clearAllMocks()
  useAgentStore.setState({
    agents: [],
    isLoading: false,
  })
  useRepoStore.setState({
    repos: [],
    defaultCloneDir: '/Users/test/repos',
  })
})

describe('AgentSettings', () => {
  it('renders the Settings header', () => {
    render(<AgentSettings onClose={vi.fn()} />)
    expect(screen.getByText('Settings')).toBeTruthy()
  })

  it('renders close button and calls onClose when clicked', () => {
    const onClose = vi.fn()
    render(<AgentSettings onClose={onClose} />)
    const closeButton = screen.getByTitle('Close settings')
    fireEvent.click(closeButton)
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('renders the General section with default repo folder', () => {
    render(<AgentSettings onClose={vi.fn()} />)
    expect(screen.getByText('General')).toBeTruthy()
    expect(screen.getByText('Default Repo Folder')).toBeTruthy()
    expect(screen.getByText('/Users/test/repos')).toBeTruthy()
  })

  it('shows ~/repos when defaultCloneDir is empty', () => {
    useRepoStore.setState({ defaultCloneDir: '' })
    render(<AgentSettings onClose={vi.fn()} />)
    expect(screen.getByText('~/repos')).toBeTruthy()
  })

  it('renders Browse button that opens folder dialog', async () => {
    vi.mocked(window.dialog.openFolder).mockResolvedValue('/new/folder')
    render(<AgentSettings onClose={vi.fn()} />)
    const browseButton = screen.getByText('Browse')
    fireEvent.click(browseButton)
    expect(window.dialog.openFolder).toHaveBeenCalled()
  })

  it('renders the AgentSettingsAgentTab', () => {
    render(<AgentSettings onClose={vi.fn()} />)
    expect(screen.getByTestId('agent-tab')).toBeTruthy()
  })

  it('renders the AgentSettingsRepoTab', () => {
    render(<AgentSettings onClose={vi.fn()} />)
    expect(screen.getByTestId('repo-tab')).toBeTruthy()
  })

  it('passes showAddForm=false initially', () => {
    render(<AgentSettings onClose={vi.fn()} />)
    expect(screen.getByTestId('agent-tab-show-add').textContent).toBe('false')
  })

  it('sets showAddForm=true when onShowAddForm is called', () => {
    render(<AgentSettings onClose={vi.fn()} />)
    fireEvent.click(screen.getByTestId('agent-tab-show-add-form'))
    expect(screen.getByTestId('agent-tab-show-add').textContent).toBe('true')
  })

  it('resets showAddForm when cancel is called', () => {
    render(<AgentSettings onClose={vi.fn()} />)
    fireEvent.click(screen.getByTestId('agent-tab-show-add-form'))
    expect(screen.getByTestId('agent-tab-show-add').textContent).toBe('true')
    fireEvent.click(screen.getByTestId('agent-tab-cancel'))
    expect(screen.getByTestId('agent-tab-show-add').textContent).toBe('false')
  })

  it('calls addAgent when onAdd is triggered with valid form data', () => {
    const addAgent = vi.fn()
    useAgentStore.setState({ agents: [], addAgent } as unknown as Record<string, unknown>)
    render(<AgentSettings onClose={vi.fn()} />)
    // Set name and command via input change
    fireEvent.change(screen.getByTestId('agent-tab-name-input'), { target: { value: 'New Agent' } })
    fireEvent.change(screen.getByTestId('agent-tab-cmd-input'), { target: { value: 'new-agent' } })
    fireEvent.change(screen.getByTestId('agent-tab-flag-input'), { target: { value: '--auto' } })
    fireEvent.click(screen.getByTestId('agent-tab-add'))
    expect(addAgent).toHaveBeenCalledWith(expect.objectContaining({
      name: 'New Agent',
      command: 'new-agent',
      skipApprovalFlag: '--auto',
    }))
  })

  it('does not call addAgent when name is empty', () => {
    const addAgent = vi.fn()
    useAgentStore.setState({ agents: [], addAgent } as unknown as Record<string, unknown>)
    render(<AgentSettings onClose={vi.fn()} />)
    fireEvent.click(screen.getByTestId('agent-tab-add'))
    expect(addAgent).not.toHaveBeenCalled()
  })

  it('sets form state when onEdit is triggered', () => {
    useAgentStore.setState({
      agents: [{ id: 'agent-1', name: 'Claude', command: 'claude', skipApprovalFlag: '--flag' }],
    } as unknown as Record<string, unknown>)
    render(<AgentSettings onClose={vi.fn()} />)
    fireEvent.click(screen.getByTestId('agent-tab-edit'))
    expect(screen.getByTestId('agent-tab-editing-id').textContent).toBe('agent-1')
    expect(screen.getByTestId('agent-tab-name').textContent).toBe('Claude')
    expect(screen.getByTestId('agent-tab-command').textContent).toBe('claude')
    expect(screen.getByTestId('agent-tab-skip-flag').textContent).toBe('--flag')
  })

  it('calls updateAgent when onUpdate is triggered', () => {
    const updateAgent = vi.fn()
    useAgentStore.setState({
      agents: [{ id: 'agent-1', name: 'Claude', command: 'claude' }],
      updateAgent,
    } as unknown as Record<string, unknown>)
    render(<AgentSettings onClose={vi.fn()} />)
    // First set editing state
    fireEvent.click(screen.getByTestId('agent-tab-edit'))
    // Then update
    fireEvent.click(screen.getByTestId('agent-tab-update'))
    expect(updateAgent).toHaveBeenCalledWith('agent-1', expect.objectContaining({
      name: 'Claude',
      command: 'claude',
    }))
  })

  it('calls removeAgent when onDelete is triggered', () => {
    const removeAgent = vi.fn()
    useAgentStore.setState({
      agents: [{ id: 'agent-1', name: 'Claude', command: 'claude' }],
      removeAgent,
    } as unknown as Record<string, unknown>)
    render(<AgentSettings onClose={vi.fn()} />)
    fireEvent.click(screen.getByTestId('agent-tab-delete'))
    expect(removeAgent).toHaveBeenCalledWith('agent-1')
  })

  it('resets editing when deleting the agent being edited', () => {
    const removeAgent = vi.fn()
    useAgentStore.setState({
      agents: [{ id: 'agent-1', name: 'Claude', command: 'claude' }],
      removeAgent,
    } as unknown as Record<string, unknown>)
    render(<AgentSettings onClose={vi.fn()} />)
    // Start editing
    fireEvent.click(screen.getByTestId('agent-tab-edit'))
    expect(screen.getByTestId('agent-tab-editing-id').textContent).toBe('agent-1')
    // Delete the same agent
    fireEvent.click(screen.getByTestId('agent-tab-delete'))
    expect(screen.getByTestId('agent-tab-editing-id').textContent).toBe('')
  })

  it('sets editingRepoId when onEditRepo is triggered', () => {
    render(<AgentSettings onClose={vi.fn()} />)
    fireEvent.click(screen.getByTestId('repo-tab-edit'))
    expect(screen.getByTestId('repo-tab-editing-id').textContent).toBe('repo-1')
  })

  it('clears agent editing when editing a repo', () => {
    useAgentStore.setState({
      agents: [{ id: 'agent-1', name: 'Claude', command: 'claude' }],
    } as unknown as Record<string, unknown>)
    render(<AgentSettings onClose={vi.fn()} />)
    // Start editing agent
    fireEvent.click(screen.getByTestId('agent-tab-edit'))
    expect(screen.getByTestId('agent-tab-editing-id').textContent).toBe('agent-1')
    // Edit repo clears agent editing
    fireEvent.click(screen.getByTestId('repo-tab-edit'))
    expect(screen.getByTestId('agent-tab-editing-id').textContent).toBe('')
    expect(screen.getByTestId('agent-tab-show-add').textContent).toBe('false')
  })
})
