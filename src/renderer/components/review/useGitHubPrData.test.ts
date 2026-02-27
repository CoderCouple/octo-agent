// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, cleanup, waitFor } from '@testing-library/react'
import '../../../test/react-setup'
import { useGitHubPrData } from './useGitHubPrData'

afterEach(() => {
  cleanup()
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useGitHubPrData', () => {
  it('returns initial state', () => {
    const { result } = renderHook(() => useGitHubPrData('session-1', '/test/dir'))
    expect(result.current.prDescription).toBeNull()
    expect(result.current.prGitHubComments).toEqual([])
    expect(result.current.prCommentsLoading).toBe(false)
    expect(result.current.prCommentsHasMore).toBe(false)
  })

  it('does not fetch when prNumber is undefined', () => {
    renderHook(() => useGitHubPrData('session-1', '/test/dir'))
    expect(window.gh.prDescription).not.toHaveBeenCalled()
    expect(window.gh.prIssueComments).not.toHaveBeenCalled()
  })

  it('fetches PR description when prNumber is provided', async () => {
    vi.mocked(window.gh.prDescription).mockResolvedValue('PR description text')
    vi.mocked(window.gh.prIssueComments).mockResolvedValue([])
    vi.mocked(window.gh.prComments).mockResolvedValue([])

    const { result } = renderHook(() => useGitHubPrData('session-1', '/test/dir', 42))

    await waitFor(() => {
      expect(result.current.prDescription).toBe('PR description text')
    })
    expect(window.gh.prDescription).toHaveBeenCalledWith('/test/dir', 42)
  })

  it('sets prDescription to null when description fetch fails', async () => {
    vi.mocked(window.gh.prDescription).mockRejectedValue(new Error('Network error'))
    vi.mocked(window.gh.prIssueComments).mockResolvedValue([])
    vi.mocked(window.gh.prComments).mockResolvedValue([])

    const { result } = renderHook(() => useGitHubPrData('session-1', '/test/dir', 42))

    await waitFor(() => {
      expect(result.current.prDescription).toBeNull()
    })
  })

  it('fetches and normalizes issue and review comments', async () => {
    vi.mocked(window.gh.prDescription).mockResolvedValue(null)
    vi.mocked(window.gh.prIssueComments).mockResolvedValue([
      { id: 1, body: 'Issue comment', author: 'alice', createdAt: '2024-01-02T00:00:00Z', url: 'url1', reactions: [] },
    ])
    vi.mocked(window.gh.prComments).mockResolvedValue([
      { id: 2, body: 'Review comment', author: 'bob', createdAt: '2024-01-01T00:00:00Z', url: 'url2', path: 'file.ts', line: 10, inReplyToId: undefined, reactions: [] },
    ])

    const { result } = renderHook(() => useGitHubPrData('session-1', '/test/dir', 42))

    await waitFor(() => {
      expect(result.current.prGitHubComments).toHaveLength(2)
    })

    // Sorted newest first
    expect(result.current.prGitHubComments[0].type).toBe('issue')
    expect(result.current.prGitHubComments[0].id).toBe(1)
    expect(result.current.prGitHubComments[1].type).toBe('review')
    expect(result.current.prGitHubComments[1].id).toBe(2)
  })

  it('sets prCommentsHasMore when issue comments fill a page', async () => {
    vi.mocked(window.gh.prDescription).mockResolvedValue(null)
    // Return exactly 20 comments (the perPage size)
    const issueComments = Array.from({ length: 20 }, (_, i) => ({
      id: i + 1,
      body: `Comment ${i}`,
      author: 'alice',
      createdAt: '2024-01-01T00:00:00Z',
      url: `url${i}`,
      reactions: [],
    }))
    vi.mocked(window.gh.prIssueComments).mockResolvedValue(issueComments)
    vi.mocked(window.gh.prComments).mockResolvedValue([])

    const { result } = renderHook(() => useGitHubPrData('session-1', '/test/dir', 42))

    await waitFor(() => {
      expect(result.current.prCommentsHasMore).toBe(true)
    })
  })

  it('sets prCommentsHasMore to false when less than a page', async () => {
    vi.mocked(window.gh.prDescription).mockResolvedValue(null)
    vi.mocked(window.gh.prIssueComments).mockResolvedValue([
      { id: 1, body: 'Comment', author: 'alice', createdAt: '2024-01-01T00:00:00Z', url: 'url1', reactions: [] },
    ])
    vi.mocked(window.gh.prComments).mockResolvedValue([])

    const { result } = renderHook(() => useGitHubPrData('session-1', '/test/dir', 42))

    await waitFor(() => {
      expect(result.current.prGitHubComments).toHaveLength(1)
    })
    expect(result.current.prCommentsHasMore).toBe(false)
  })

  it('loadOlderComments appends new comments without duplicates', async () => {
    vi.mocked(window.gh.prDescription).mockResolvedValue(null)
    vi.mocked(window.gh.prIssueComments).mockResolvedValue([
      { id: 1, body: 'First', author: 'alice', createdAt: '2024-01-02T00:00:00Z', url: 'url1', reactions: [] },
    ])
    vi.mocked(window.gh.prComments).mockResolvedValue([])

    const { result } = renderHook(() => useGitHubPrData('session-1', '/test/dir', 42))

    await waitFor(() => {
      expect(result.current.prGitHubComments).toHaveLength(1)
    })

    // Now load more with a new comment and a duplicate
    vi.mocked(window.gh.prIssueComments).mockResolvedValue([
      { id: 1, body: 'First', author: 'alice', createdAt: '2024-01-02T00:00:00Z', url: 'url1', reactions: [] },
      { id: 3, body: 'Older', author: 'bob', createdAt: '2024-01-01T00:00:00Z', url: 'url3', reactions: [] },
    ])

    act(() => {
      result.current.loadOlderComments()
    })

    await waitFor(() => {
      expect(result.current.prGitHubComments).toHaveLength(2)
    })
    // Verify no duplicates
    const ids = result.current.prGitHubComments.map(c => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('refreshComments resets to fresh fetch', async () => {
    vi.mocked(window.gh.prDescription).mockResolvedValue(null)
    vi.mocked(window.gh.prIssueComments).mockResolvedValue([
      { id: 1, body: 'Comment', author: 'alice', createdAt: '2024-01-01T00:00:00Z', url: 'url1', reactions: [] },
    ])
    vi.mocked(window.gh.prComments).mockResolvedValue([])

    const { result } = renderHook(() => useGitHubPrData('session-1', '/test/dir', 42))

    await waitFor(() => {
      expect(result.current.prGitHubComments).toHaveLength(1)
    })

    // Change the mock to return different data
    vi.mocked(window.gh.prIssueComments).mockResolvedValue([
      { id: 4, body: 'New comment', author: 'carol', createdAt: '2024-01-03T00:00:00Z', url: 'url4', reactions: [] },
    ])

    act(() => {
      result.current.refreshComments()
    })

    await waitFor(() => {
      expect(result.current.prGitHubComments).toHaveLength(1)
      expect(result.current.prGitHubComments[0].id).toBe(4)
    })
  })

  it('resetGitHubPrData clears all state', async () => {
    vi.mocked(window.gh.prDescription).mockResolvedValue('Description')
    vi.mocked(window.gh.prIssueComments).mockResolvedValue([
      { id: 1, body: 'Comment', author: 'alice', createdAt: '2024-01-01T00:00:00Z', url: 'url1', reactions: [] },
    ])
    vi.mocked(window.gh.prComments).mockResolvedValue([])

    const { result } = renderHook(() => useGitHubPrData('session-1', '/test/dir', 42))

    await waitFor(() => {
      expect(result.current.prGitHubComments).toHaveLength(1)
    })

    act(() => {
      result.current.resetGitHubPrData()
    })

    expect(result.current.prDescription).toBeNull()
    expect(result.current.prGitHubComments).toEqual([])
    expect(result.current.prCommentsHasMore).toBe(false)
  })

  it('clears comments when prNumber becomes undefined', async () => {
    vi.mocked(window.gh.prDescription).mockResolvedValue('Description')
    vi.mocked(window.gh.prIssueComments).mockResolvedValue([
      { id: 1, body: 'Comment', author: 'alice', createdAt: '2024-01-01T00:00:00Z', url: 'url1', reactions: [] },
    ])
    vi.mocked(window.gh.prComments).mockResolvedValue([])

    const { result, rerender } = renderHook(
      ({ prNumber }) => useGitHubPrData('session-1', '/test/dir', prNumber),
      { initialProps: { prNumber: 42 as number | undefined } },
    )

    await waitFor(() => {
      expect(result.current.prGitHubComments).toHaveLength(1)
    })

    rerender({ prNumber: undefined })

    await waitFor(() => {
      expect(result.current.prDescription).toBeNull()
      expect(result.current.prGitHubComments).toEqual([])
    })
  })

  it('handles fetch error gracefully', async () => {
    vi.mocked(window.gh.prDescription).mockResolvedValue(null)
    vi.mocked(window.gh.prIssueComments).mockRejectedValue(new Error('API error'))
    vi.mocked(window.gh.prComments).mockRejectedValue(new Error('API error'))

    const { result } = renderHook(() => useGitHubPrData('session-1', '/test/dir', 42))

    await waitFor(() => {
      expect(result.current.prCommentsLoading).toBe(false)
    })
    // Should not crash, just leave comments empty
    expect(result.current.prGitHubComments).toEqual([])
  })
})
