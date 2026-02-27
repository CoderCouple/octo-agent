// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor, act } from '@testing-library/react'
import '../../../test/react-setup'
import { IssuesView } from './IssuesView'
import type { ManagedRepo } from '../../../preload/index'

const mockRepo: ManagedRepo = {
  id: 'repo-1',
  name: 'my-project',
  remoteUrl: 'https://github.com/user/my-project.git',
  rootDir: '/repos/my-project',
  defaultBranch: 'main',
}

afterEach(() => {
  cleanup()
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('IssuesView', () => {
  it('renders header with repo name', () => {
    vi.mocked(window.gh.issues).mockReturnValue(new Promise(() => {}))
    render(<IssuesView repo={mockRepo} onBack={vi.fn()} onSelectIssue={vi.fn()} />)
    expect(screen.getByText('Issues')).toBeTruthy()
    expect(screen.getByText(/my-project/)).toBeTruthy()
  })

  it('shows loading state initially', () => {
    vi.mocked(window.gh.issues).mockReturnValue(new Promise(() => {}))
    render(<IssuesView repo={mockRepo} onBack={vi.fn()} onSelectIssue={vi.fn()} />)
    expect(screen.getByText('Loading issues...')).toBeTruthy()
  })

  it('calls onBack when Cancel is clicked', () => {
    vi.mocked(window.gh.issues).mockReturnValue(new Promise(() => {}))
    const onBack = vi.fn()
    render(<IssuesView repo={mockRepo} onBack={onBack} onSelectIssue={vi.fn()} />)
    fireEvent.click(screen.getByText('Cancel'))
    expect(onBack).toHaveBeenCalled()
  })

  it('shows empty state when no issues', async () => {
    vi.mocked(window.gh.issues).mockResolvedValue([])
    render(<IssuesView repo={mockRepo} onBack={vi.fn()} onSelectIssue={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByText(/No open issues assigned to you/)).toBeTruthy()
    })
  })

  it('shows issues after loading', async () => {
    vi.mocked(window.gh.issues).mockResolvedValue([
      { number: 42, title: 'Fix login bug', labels: ['bug'], url: 'https://github.com/user/my-project/issues/42' },
      { number: 43, title: 'Add dark mode', labels: ['enhancement', 'ui'], url: 'https://github.com/user/my-project/issues/43' },
    ])
    render(<IssuesView repo={mockRepo} onBack={vi.fn()} onSelectIssue={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByText('#42')).toBeTruthy()
      expect(screen.getByText('Fix login bug')).toBeTruthy()
      expect(screen.getByText('#43')).toBeTruthy()
      expect(screen.getByText('Add dark mode')).toBeTruthy()
    })
  })

  it('renders labels on issues', async () => {
    vi.mocked(window.gh.issues).mockResolvedValue([
      { number: 42, title: 'Fix login bug', labels: ['bug', 'priority'], url: 'https://github.com/user/my-project/issues/42' },
    ])
    render(<IssuesView repo={mockRepo} onBack={vi.fn()} onSelectIssue={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByText('bug')).toBeTruthy()
      expect(screen.getByText('priority')).toBeTruthy()
    })
  })

  it('calls onSelectIssue when issue is clicked', async () => {
    const issue = { number: 42, title: 'Fix login bug', labels: ['bug'], url: 'https://github.com/user/my-project/issues/42' }
    vi.mocked(window.gh.issues).mockResolvedValue([issue])
    const onSelectIssue = vi.fn()
    render(<IssuesView repo={mockRepo} onBack={vi.fn()} onSelectIssue={onSelectIssue} />)
    await waitFor(() => {
      expect(screen.getByText('Fix login bug')).toBeTruthy()
    })
    fireEvent.click(screen.getByText('Fix login bug'))
    expect(onSelectIssue).toHaveBeenCalledWith(issue)
  })

  it('shows error when fetching issues fails', async () => {
    vi.mocked(window.gh.issues).mockRejectedValue(new Error('Rate limit exceeded'))
    render(<IssuesView repo={mockRepo} onBack={vi.fn()} onSelectIssue={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByText(/Rate limit exceeded/)).toBeTruthy()
    })
  })

  it('renders the search input', () => {
    vi.mocked(window.gh.issues).mockReturnValue(new Promise(() => {}))
    render(<IssuesView repo={mockRepo} onBack={vi.fn()} onSelectIssue={vi.fn()} />)
    expect(screen.getByPlaceholderText('Search issues...')).toBeTruthy()
  })

  describe('search functionality', () => {
    /** Flush microtasks so `.then()` callbacks run */
    const flushPromises = () => act(() => Promise.resolve())

    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('calls searchIssues after debounce when typing', async () => {
      vi.mocked(window.gh.issues).mockResolvedValue([])
      vi.mocked(window.gh.searchIssues).mockResolvedValue([
        { number: 10, title: 'Search result', labels: [], url: 'https://github.com/user/my-project/issues/10' },
      ])

      // Render and flush the initial issues load
      await act(async () => {
        render(<IssuesView repo={mockRepo} onBack={vi.fn()} onSelectIssue={vi.fn()} />)
        await flushPromises()
      })

      // Type a search query
      fireEvent.change(screen.getByPlaceholderText('Search issues...'), { target: { value: 'search' } })

      // Should show "Searching..." before debounce fires
      expect(screen.getByText('Searching...')).toBeTruthy()

      // searchIssues shouldn't be called yet (debounce)
      expect(window.gh.searchIssues).not.toHaveBeenCalled()

      // Advance past debounce and flush the promise from searchIssues
      act(() => { vi.advanceTimersByTime(300) })
      await flushPromises()

      expect(window.gh.searchIssues).toHaveBeenCalledWith('/repos/my-project/main', 'search')
      expect(screen.getByText('Search result')).toBeTruthy()
      expect(screen.getByText('#10')).toBeTruthy()
    })

    it('shows search results instead of assigned issues', async () => {
      vi.mocked(window.gh.issues).mockResolvedValue([
        { number: 42, title: 'Assigned issue', labels: [], url: 'https://github.com/user/my-project/issues/42' },
      ])
      vi.mocked(window.gh.searchIssues).mockResolvedValue([
        { number: 99, title: 'Found issue', labels: [], url: 'https://github.com/user/my-project/issues/99' },
      ])

      await act(async () => {
        render(<IssuesView repo={mockRepo} onBack={vi.fn()} onSelectIssue={vi.fn()} />)
        await flushPromises()
      })

      expect(screen.getByText('Assigned issue')).toBeTruthy()

      fireEvent.change(screen.getByPlaceholderText('Search issues...'), { target: { value: 'found' } })
      act(() => { vi.advanceTimersByTime(300) })
      await flushPromises()

      expect(screen.getByText('Found issue')).toBeTruthy()
      expect(screen.queryByText('Assigned issue')).toBeNull()
    })

    it('shows assigned issues again when search is cleared', async () => {
      vi.mocked(window.gh.issues).mockResolvedValue([
        { number: 42, title: 'Assigned issue', labels: [], url: 'https://github.com/user/my-project/issues/42' },
      ])
      vi.mocked(window.gh.searchIssues).mockResolvedValue([
        { number: 99, title: 'Found issue', labels: [], url: 'https://github.com/user/my-project/issues/99' },
      ])

      await act(async () => {
        render(<IssuesView repo={mockRepo} onBack={vi.fn()} onSelectIssue={vi.fn()} />)
        await flushPromises()
      })

      expect(screen.getByText('Assigned issue')).toBeTruthy()

      // Search
      fireEvent.change(screen.getByPlaceholderText('Search issues...'), { target: { value: 'found' } })
      act(() => { vi.advanceTimersByTime(300) })
      await flushPromises()
      expect(screen.getByText('Found issue')).toBeTruthy()

      // Clear search
      fireEvent.change(screen.getByPlaceholderText('Search issues...'), { target: { value: '' } })

      expect(screen.getByText('Assigned issue')).toBeTruthy()
      expect(screen.queryByText('Found issue')).toBeNull()
    })

    it('shows "Search results" subtitle when searching', async () => {
      vi.mocked(window.gh.issues).mockResolvedValue([])

      await act(async () => {
        render(<IssuesView repo={mockRepo} onBack={vi.fn()} onSelectIssue={vi.fn()} />)
        await flushPromises()
      })

      expect(screen.getByText(/Assigned to me/)).toBeTruthy()

      fireEvent.change(screen.getByPlaceholderText('Search issues...'), { target: { value: 'test' } })

      expect(screen.getByText(/Search results/)).toBeTruthy()
    })

    it('shows "No issues found" when search returns empty', async () => {
      vi.mocked(window.gh.issues).mockResolvedValue([])
      vi.mocked(window.gh.searchIssues).mockResolvedValue([])

      await act(async () => {
        render(<IssuesView repo={mockRepo} onBack={vi.fn()} onSelectIssue={vi.fn()} />)
        await flushPromises()
      })

      fireEvent.change(screen.getByPlaceholderText('Search issues...'), { target: { value: 'nonexistent' } })
      act(() => { vi.advanceTimersByTime(300) })
      await flushPromises()

      expect(screen.getByText('No issues found.')).toBeTruthy()
    })
  })
})
