// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import '../../../../test/react-setup'
import { useRepoStore } from '../../../store/repos'
import { HomeView } from './HomeView'

afterEach(() => {
  cleanup()
})

beforeEach(() => {
  vi.clearAllMocks()
  useRepoStore.setState({
    repos: [],
    ghAvailable: true,
  })
})

function makeProps(overrides: Record<string, unknown> = {}) {
  return {
    onClone: vi.fn(),
    onAddExistingRepo: vi.fn(),
    onOpenFolder: vi.fn(),
    onNewBranch: vi.fn(),
    onExistingBranch: vi.fn(),
    onRepoSettings: vi.fn(),
    onIssues: vi.fn(),
    onReviewPrs: vi.fn(),
    onOpenMain: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  }
}

describe('HomeView', () => {
  it('renders header', () => {
    render(<HomeView {...makeProps()} />)
    expect(screen.getByText('New Session')).toBeTruthy()
  })

  it('renders Clone, Add Repo, and Folder buttons with underlined hints', () => {
    const { container } = render(<HomeView {...makeProps()} />)
    const underlines = container.querySelectorAll('u')
    expect(underlines.length).toBeGreaterThanOrEqual(3)
  })

  it('calls onClone when Clone is clicked', () => {
    const props = makeProps()
    const { container } = render(<HomeView {...props} />)
    const cloneBtn = [...container.querySelectorAll('button')].find(b => b.textContent?.includes('lone'))!
    fireEvent.click(cloneBtn)
    expect(props.onClone).toHaveBeenCalled()
  })

  it('calls onAddExistingRepo when Add Repo is clicked', () => {
    const props = makeProps()
    const { container } = render(<HomeView {...props} />)
    const addBtn = [...container.querySelectorAll('button')].find(b => b.textContent?.includes('dd Repo'))!
    fireEvent.click(addBtn)
    expect(props.onAddExistingRepo).toHaveBeenCalled()
  })

  it('calls onOpenFolder when Folder is clicked', () => {
    const props = makeProps()
    const { container } = render(<HomeView {...props} />)
    const folderBtn = [...container.querySelectorAll('button')].find(b => b.textContent?.includes('older'))!
    fireEvent.click(folderBtn)
    expect(props.onOpenFolder).toHaveBeenCalled()
  })

  it('calls onCancel when Cancel is clicked', () => {
    const props = makeProps()
    render(<HomeView {...props} />)
    fireEvent.click(screen.getByText('Cancel'))
    expect(props.onCancel).toHaveBeenCalled()
  })

  it('shows empty state when no repos', () => {
    render(<HomeView {...makeProps()} />)
    expect(screen.getByText(/No managed repositories yet/)).toBeTruthy()
  })

  it('shows repos when available', () => {
    useRepoStore.setState({
      repos: [
        { id: 'repo-1', name: 'My Project', remoteUrl: '', rootDir: '/repos/my-project', defaultBranch: 'main' },
      ],
      ghAvailable: true,
    })
    render(<HomeView {...makeProps()} />)
    expect(screen.getByText('Your Repositories')).toBeTruthy()
    expect(screen.getByText('My Project')).toBeTruthy()
  })

  it('renders New, Existing, Open buttons for each repo', () => {
    useRepoStore.setState({
      repos: [
        { id: 'repo-1', name: 'My Project', remoteUrl: '', rootDir: '/repos/my-project', defaultBranch: 'main' },
      ],
      ghAvailable: true,
    })
    const { container } = render(<HomeView {...makeProps()} />)
    expect(container.querySelector('[title="Create a new branch worktree"]')).toBeTruthy()
    expect(container.querySelector('[title="Open an existing branch"]')).toBeTruthy()
    expect(container.querySelector('[title="Open main branch"]')).toBeTruthy()
  })

  it('shows Issues and Review buttons when ghAvailable is true', () => {
    useRepoStore.setState({
      repos: [
        { id: 'repo-1', name: 'My Project', remoteUrl: '', rootDir: '/repos/my-project', defaultBranch: 'main' },
      ],
      ghAvailable: true,
    })
    const { container } = render(<HomeView {...makeProps()} />)
    expect(container.querySelector('[title="Browse GitHub issues"]')).toBeTruthy()
    expect(container.querySelector('[title="Review pull requests"]')).toBeTruthy()
  })

  it('hides Issues and Review buttons when ghAvailable is false', () => {
    useRepoStore.setState({
      repos: [
        { id: 'repo-1', name: 'My Project', remoteUrl: '', rootDir: '/repos/my-project', defaultBranch: 'main' },
      ],
      ghAvailable: false,
    })
    const { container } = render(<HomeView {...makeProps()} />)
    expect(container.querySelector('[title="Browse GitHub issues"]')).toBeNull()
    expect(container.querySelector('[title="Review pull requests"]')).toBeNull()
  })

  it('shows gh not found warning when ghAvailable is false with repos', () => {
    useRepoStore.setState({
      repos: [
        { id: 'repo-1', name: 'My Project', remoteUrl: '', rootDir: '/repos/my-project', defaultBranch: 'main' },
      ],
      ghAvailable: false,
    })
    render(<HomeView {...makeProps()} />)
    expect(screen.getByText(/GitHub CLI.*not found/)).toBeTruthy()
  })

  it('calls onNewBranch with repo when New is clicked', () => {
    const repo = { id: 'repo-1', name: 'My Project', remoteUrl: '', rootDir: '/repos/my-project', defaultBranch: 'main' }
    useRepoStore.setState({ repos: [repo], ghAvailable: true })
    const props = makeProps()
    const { container } = render(<HomeView {...props} />)
    fireEvent.click(container.querySelector('[title="Create a new branch worktree"]')!)
    expect(props.onNewBranch).toHaveBeenCalledWith(repo)
  })

  it('calls onExistingBranch with repo when Existing is clicked', () => {
    const repo = { id: 'repo-1', name: 'My Project', remoteUrl: '', rootDir: '/repos/my-project', defaultBranch: 'main' }
    useRepoStore.setState({ repos: [repo], ghAvailable: true })
    const props = makeProps()
    const { container } = render(<HomeView {...props} />)
    fireEvent.click(container.querySelector('[title="Open an existing branch"]')!)
    expect(props.onExistingBranch).toHaveBeenCalledWith(repo)
  })

  it('calls onOpenMain with repo when Open is clicked', () => {
    const repo = { id: 'repo-1', name: 'My Project', remoteUrl: '', rootDir: '/repos/my-project', defaultBranch: 'main' }
    useRepoStore.setState({ repos: [repo], ghAvailable: true })
    const props = makeProps()
    const { container } = render(<HomeView {...props} />)
    fireEvent.click(container.querySelector('[title="Open main branch"]')!)
    expect(props.onOpenMain).toHaveBeenCalledWith(repo)
  })

  it('calls onIssues when Issues button is clicked', () => {
    const repo = { id: 'repo-1', name: 'My Project', remoteUrl: '', rootDir: '/repos/my-project', defaultBranch: 'main' }
    useRepoStore.setState({ repos: [repo], ghAvailable: true })
    const props = makeProps()
    const { container } = render(<HomeView {...props} />)
    fireEvent.click(container.querySelector('[title="Browse GitHub issues"]')!)
    expect(props.onIssues).toHaveBeenCalledWith(repo)
  })

  it('calls onReviewPrs when Review button is clicked', () => {
    const repo = { id: 'repo-1', name: 'My Project', remoteUrl: '', rootDir: '/repos/my-project', defaultBranch: 'main' }
    useRepoStore.setState({ repos: [repo], ghAvailable: true })
    const props = makeProps()
    const { container } = render(<HomeView {...props} />)
    fireEvent.click(container.querySelector('[title="Review pull requests"]')!)
    expect(props.onReviewPrs).toHaveBeenCalledWith(repo)
  })

  it('calls onRepoSettings when settings button is clicked', () => {
    const repo = { id: 'repo-1', name: 'My Project', remoteUrl: '', rootDir: '/repos/my-project', defaultBranch: 'main' }
    useRepoStore.setState({ repos: [repo], ghAvailable: true })
    const props = makeProps()
    const { container } = render(<HomeView {...props} />)
    fireEvent.click(container.querySelector('[title="Repository settings"]')!)
    expect(props.onRepoSettings).toHaveBeenCalledWith(repo)
  })

  it('opens cli.github.com when link is clicked', () => {
    const repo = { id: 'repo-1', name: 'My Project', remoteUrl: '', rootDir: '/repos/my-project', defaultBranch: 'main' }
    useRepoStore.setState({ repos: [repo], ghAvailable: false })
    render(<HomeView {...makeProps()} />)
    fireEvent.click(screen.getByText('cli.github.com'))
    expect(window.shell.openExternal).toHaveBeenCalledWith('https://cli.github.com')
  })

  describe('keyboard navigation', () => {
    it('C key triggers onClone', () => {
      const props = makeProps()
      render(<HomeView {...props} />)
      fireEvent.keyDown(window, { key: 'c' })
      expect(props.onClone).toHaveBeenCalled()
    })

    it('A key triggers onAddExistingRepo', () => {
      const props = makeProps()
      render(<HomeView {...props} />)
      fireEvent.keyDown(window, { key: 'a' })
      expect(props.onAddExistingRepo).toHaveBeenCalled()
    })

    it('F key triggers onOpenFolder', () => {
      const props = makeProps()
      render(<HomeView {...props} />)
      fireEvent.keyDown(window, { key: 'f' })
      expect(props.onOpenFolder).toHaveBeenCalled()
    })

    it('Escape triggers onCancel', () => {
      const props = makeProps()
      render(<HomeView {...props} />)
      fireEvent.keyDown(window, { key: 'Escape' })
      expect(props.onCancel).toHaveBeenCalled()
    })

    it('N key triggers onNewBranch with focused repo', () => {
      const repo = { id: 'repo-1', name: 'My Project', remoteUrl: '', rootDir: '/repos/my-project', defaultBranch: 'main' }
      useRepoStore.setState({ repos: [repo], ghAvailable: true })
      const props = makeProps()
      render(<HomeView {...props} />)
      fireEvent.keyDown(window, { key: 'n' })
      expect(props.onNewBranch).toHaveBeenCalledWith(repo)
    })

    it('E key triggers onExistingBranch with focused repo', () => {
      const repo = { id: 'repo-1', name: 'My Project', remoteUrl: '', rootDir: '/repos/my-project', defaultBranch: 'main' }
      useRepoStore.setState({ repos: [repo], ghAvailable: true })
      const props = makeProps()
      render(<HomeView {...props} />)
      fireEvent.keyDown(window, { key: 'e' })
      expect(props.onExistingBranch).toHaveBeenCalledWith(repo)
    })

    it('O key triggers onOpenMain with focused repo', () => {
      const repo = { id: 'repo-1', name: 'My Project', remoteUrl: '', rootDir: '/repos/my-project', defaultBranch: 'main' }
      useRepoStore.setState({ repos: [repo], ghAvailable: true })
      const props = makeProps()
      render(<HomeView {...props} />)
      fireEvent.keyDown(window, { key: 'o' })
      expect(props.onOpenMain).toHaveBeenCalledWith(repo)
    })

    it('ArrowDown changes focused repo index', () => {
      const repos = [
        { id: 'repo-1', name: 'Project A', remoteUrl: '', rootDir: '/repos/a', defaultBranch: 'main' },
        { id: 'repo-2', name: 'Project B', remoteUrl: '', rootDir: '/repos/b', defaultBranch: 'main' },
      ]
      useRepoStore.setState({ repos, ghAvailable: true })
      const props = makeProps()
      const { container } = render(<HomeView {...props} />)

      // First repo should be focused initially (has ring class)
      const repoRows = container.querySelectorAll('.ring-1')
      expect(repoRows.length).toBe(1)

      // Press ArrowDown to move to second repo
      fireEvent.keyDown(window, { key: 'ArrowDown' })

      // N key should now act on the second repo
      fireEvent.keyDown(window, { key: 'n' })
      expect(props.onNewBranch).toHaveBeenCalledWith(repos[1])
    })

    it('ArrowUp changes focused repo index', () => {
      const repos = [
        { id: 'repo-1', name: 'Project A', remoteUrl: '', rootDir: '/repos/a', defaultBranch: 'main' },
        { id: 'repo-2', name: 'Project B', remoteUrl: '', rootDir: '/repos/b', defaultBranch: 'main' },
      ]
      useRepoStore.setState({ repos, ghAvailable: true })
      const props = makeProps()
      render(<HomeView {...props} />)

      // Move down then back up
      fireEvent.keyDown(window, { key: 'ArrowDown' })
      fireEvent.keyDown(window, { key: 'ArrowUp' })

      // N key should act on first repo
      fireEvent.keyDown(window, { key: 'n' })
      expect(props.onNewBranch).toHaveBeenCalledWith(repos[0])
    })

    it('ignores letter keys when input is focused', () => {
      const props = makeProps()
      const { container } = render(<HomeView {...props} />)

      // Create and focus an input (simulating a focused input inside the component)
      const input = document.createElement('input')
      container.appendChild(input)
      input.focus()

      // Dispatch from input so e.target is the input element (capture-phase handler checks this)
      fireEvent.keyDown(input, { key: 'c' })
      expect(props.onClone).not.toHaveBeenCalled()

      container.removeChild(input)
    })

    it('ignores letter keys with meta modifier', () => {
      const props = makeProps()
      render(<HomeView {...props} />)
      fireEvent.keyDown(window, { key: 'c', metaKey: true })
      expect(props.onClone).not.toHaveBeenCalled()
    })

    it('shows focus ring on focused repo', () => {
      const repos = [
        { id: 'repo-1', name: 'Project A', remoteUrl: '', rootDir: '/repos/a', defaultBranch: 'main' },
        { id: 'repo-2', name: 'Project B', remoteUrl: '', rootDir: '/repos/b', defaultBranch: 'main' },
      ]
      useRepoStore.setState({ repos, ghAvailable: true })
      const { container } = render(<HomeView {...makeProps()} />)

      // First repo should have the focus ring
      const repoRows = container.querySelectorAll('.ring-1')
      expect(repoRows.length).toBe(1)
    })
  })
})
