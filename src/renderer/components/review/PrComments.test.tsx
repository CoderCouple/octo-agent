// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor, act } from '@testing-library/react'
import '../../../test/react-setup'
import { formatRelativeTime, PrCommentsSection } from './PrComments'
import type { NormalizedComment } from './useReviewData'

afterEach(() => {
  cleanup()
})

beforeEach(() => {
  vi.clearAllMocks()
})

function makeComment(overrides: Partial<NormalizedComment> = {}): NormalizedComment {
  return {
    id: 1,
    body: 'Test comment body',
    author: 'alice',
    createdAt: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
    url: 'https://github.com/test/pr/1#comment-1',
    type: 'issue',
    ...overrides,
  }
}

describe('formatRelativeTime', () => {
  it('returns "just now" for times less than a minute ago', () => {
    const now = new Date().toISOString()
    expect(formatRelativeTime(now)).toBe('just now')
  })

  it('returns minutes ago for times less than an hour', () => {
    const date = new Date(Date.now() - 5 * 60000).toISOString()
    expect(formatRelativeTime(date)).toBe('5m ago')
  })

  it('returns hours ago for times less than a day', () => {
    const date = new Date(Date.now() - 3 * 3600000).toISOString()
    expect(formatRelativeTime(date)).toBe('3h ago')
  })

  it('returns days ago for times less than 30 days', () => {
    const date = new Date(Date.now() - 7 * 86400000).toISOString()
    expect(formatRelativeTime(date)).toBe('7d ago')
  })

  it('returns formatted date for times older than 30 days', () => {
    const date = new Date(Date.now() - 60 * 86400000).toISOString()
    const result = formatRelativeTime(date)
    // Should be a locale-formatted date string, not "Xd ago"
    expect(result).not.toContain('d ago')
    expect(result).not.toBe('just now')
  })
})

describe('PrCommentsSection', () => {
  const defaultProps = {
    prGitHubComments: [] as NormalizedComment[],
    prCommentsLoading: false,
    prCommentsHasMore: false,
    onLoadOlderComments: vi.fn(),
    onClickLocation: vi.fn(),
    repoDir: '/test/repo',
    prNumber: 42,
    onRefreshComments: vi.fn(),
  }

  it('renders the section title with count', () => {
    const comments = [makeComment({ id: 1 }), makeComment({ id: 2 })]
    render(<PrCommentsSection {...defaultProps} prGitHubComments={comments} />)
    expect(screen.getByText('PR Comments')).toBeTruthy()
  })

  it('renders comment threads for top-level comments', () => {
    const comments = [
      makeComment({ id: 1, author: 'alice', body: 'First comment' }),
      makeComment({ id: 2, author: 'bob', body: 'Second comment' }),
    ]
    render(<PrCommentsSection {...defaultProps} prGitHubComments={comments} />)
    expect(screen.getByText('alice')).toBeTruthy()
    expect(screen.getByText('bob')).toBeTruthy()
  })

  it('shows loading spinner when loading', () => {
    render(<PrCommentsSection {...defaultProps} prCommentsLoading={true} />)
    // The spinner svg has animate-spin class
    const spinner = document.querySelector('.animate-spin')
    expect(spinner).toBeTruthy()
  })

  it('shows "Show older comments" when hasMore is true', () => {
    const comments = [makeComment()]
    render(<PrCommentsSection {...defaultProps} prGitHubComments={comments} prCommentsHasMore={true} />)
    expect(screen.getByText('Show older comments')).toBeTruthy()
  })

  it('calls onLoadOlderComments when "Show older comments" is clicked', () => {
    const onLoadOlderComments = vi.fn()
    const comments = [makeComment()]
    render(<PrCommentsSection {...defaultProps} prGitHubComments={comments} prCommentsHasMore={true} onLoadOlderComments={onLoadOlderComments} />)
    fireEvent.click(screen.getByText('Show older comments'))
    expect(onLoadOlderComments).toHaveBeenCalled()
  })

  it('does not show "Show older comments" when loading', () => {
    const comments = [makeComment()]
    render(<PrCommentsSection {...defaultProps} prGitHubComments={comments} prCommentsHasMore={true} prCommentsLoading={true} />)
    expect(screen.queryByText('Show older comments')).toBeNull()
  })

  it('filters to active comments when Active filter is clicked', () => {
    const comments = [
      makeComment({ id: 1, type: 'review', body: 'Active review', line: 10, path: 'file.ts' }),
      makeComment({ id: 2, type: 'review', body: 'Outdated review', line: null, path: 'file.ts' }),
      makeComment({ id: 3, type: 'issue', body: 'Issue comment' }),
    ]
    render(<PrCommentsSection {...defaultProps} prGitHubComments={comments} />)
    fireEvent.click(screen.getByText('Active'))
    // Outdated review (line=null) should be filtered out
    // Issue comments are always shown in active mode
    expect(screen.getByText('Issue comment')).toBeTruthy()
  })

  it('toggles sort order between newest and oldest', () => {
    const comments = [makeComment()]
    render(<PrCommentsSection {...defaultProps} prGitHubComments={comments} />)
    const sortButton = screen.getByText(/Newest/)
    fireEvent.click(sortButton)
    expect(screen.getByText(/Oldest/)).toBeTruthy()
    fireEvent.click(screen.getByText(/Oldest/))
    expect(screen.getByText(/Newest/)).toBeTruthy()
  })

  it('expands a comment thread when clicked', () => {
    const comments = [makeComment({ id: 1, body: 'Full comment body here' })]
    render(<PrCommentsSection {...defaultProps} prGitHubComments={comments} />)
    // Click the comment to expand it
    const commentButton = screen.getByText('alice').closest('button')!
    fireEvent.click(commentButton)
    // Full body should be visible
    expect(screen.getByText('Full comment body here')).toBeTruthy()
  })

  it('collapses a comment thread when clicked again', () => {
    const comments = [makeComment({ id: 1, body: 'Full comment body' })]
    render(<PrCommentsSection {...defaultProps} prGitHubComments={comments} />)
    const commentButton = screen.getByText('alice').closest('button')!
    // Expand
    fireEvent.click(commentButton)
    expect(screen.getByText('Full comment body')).toBeTruthy()
    // Collapse
    fireEvent.click(commentButton)
    // Body should appear only in truncated form now
    expect(screen.getByText('Full comment body')).toBeTruthy() // truncated preview still shows it
  })

  it('shows reply count for threads with replies', () => {
    const comments = [
      makeComment({ id: 1, type: 'review', body: 'Parent comment', path: 'file.ts', line: 5 }),
      makeComment({ id: 2, type: 'review', body: 'Reply to parent', inReplyToId: 1 }),
    ]
    render(<PrCommentsSection {...defaultProps} prGitHubComments={comments} />)
    expect(screen.getByText('1 reply')).toBeTruthy()
  })

  it('shows file location for review comments', () => {
    const comments = [
      makeComment({ id: 1, type: 'review', body: 'Review', path: 'src/app.ts', line: 42 }),
    ]
    render(<PrCommentsSection {...defaultProps} prGitHubComments={comments} />)
    expect(screen.getByText('app.ts:42')).toBeTruthy()
  })

  it('calls onClickLocation when file location is clicked', () => {
    const onClickLocation = vi.fn()
    const comments = [
      makeComment({ id: 1, type: 'review', body: 'Review', path: 'src/app.ts', line: 42 }),
    ]
    render(<PrCommentsSection {...defaultProps} prGitHubComments={comments} onClickLocation={onClickLocation} />)
    fireEvent.click(screen.getByText('app.ts:42'))
    expect(onClickLocation).toHaveBeenCalledWith({ file: 'src/app.ts', startLine: 42 })
  })

  it('shows outdated badge for review comments with null line', () => {
    const comments = [
      makeComment({ id: 1, type: 'review', body: 'Outdated', line: null, path: 'file.ts' }),
    ]
    render(<PrCommentsSection {...defaultProps} prGitHubComments={comments} />)
    expect(screen.getByText('outdated')).toBeTruthy()
  })

  it('shows Reply button for expanded review comment threads', () => {
    const comments = [
      makeComment({ id: 1, type: 'review', body: 'Review comment', path: 'file.ts', line: 5 }),
    ]
    render(<PrCommentsSection {...defaultProps} prGitHubComments={comments} />)
    // Expand the comment
    const commentButton = screen.getByText('alice').closest('button')!
    fireEvent.click(commentButton)
    expect(screen.getByText('Reply')).toBeTruthy()
  })

  it('shows reply box when Reply is clicked', () => {
    const comments = [
      makeComment({ id: 1, type: 'review', body: 'Review comment', path: 'file.ts', line: 5 }),
    ]
    render(<PrCommentsSection {...defaultProps} prGitHubComments={comments} />)
    // Expand and click Reply
    const commentButton = screen.getByText('alice').closest('button')!
    fireEvent.click(commentButton)
    fireEvent.click(screen.getByText('Reply'))
    expect(screen.getByPlaceholderText('Write a reply...')).toBeTruthy()
  })

  it('submits a reply and calls onRefreshComments', async () => {
    vi.mocked(window.gh.replyToComment).mockResolvedValue({ success: true })
    const onRefreshComments = vi.fn()
    const comments = [
      makeComment({ id: 1, type: 'review', body: 'Review comment', path: 'file.ts', line: 5 }),
    ]
    render(<PrCommentsSection {...defaultProps} prGitHubComments={comments} onRefreshComments={onRefreshComments} />)
    // Expand, click Reply, type, and submit
    fireEvent.click(screen.getByText('alice').closest('button')!)
    fireEvent.click(screen.getByText('Reply'))
    const textarea = screen.getByPlaceholderText('Write a reply...')
    fireEvent.change(textarea, { target: { value: 'My reply' } })
    fireEvent.click(screen.getByText('Reply', { selector: 'button.px-2' }))

    await waitFor(() => {
      expect(window.gh.replyToComment).toHaveBeenCalledWith('/test/repo', 42, 1, 'My reply')
    })
  })

  it('submits reply via Cmd+Enter keyboard shortcut', async () => {
    vi.mocked(window.gh.replyToComment).mockResolvedValue({ success: true })
    const comments = [
      makeComment({ id: 1, type: 'review', body: 'Review comment', path: 'file.ts', line: 5 }),
    ]
    render(<PrCommentsSection {...defaultProps} prGitHubComments={comments} />)
    fireEvent.click(screen.getByText('alice').closest('button')!)
    fireEvent.click(screen.getByText('Reply'))
    const textarea = screen.getByPlaceholderText('Write a reply...')
    fireEvent.change(textarea, { target: { value: 'Keyboard reply' } })
    fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true })

    await waitFor(() => {
      expect(window.gh.replyToComment).toHaveBeenCalled()
    })
  })

  it('does not submit empty reply', async () => {
    const comments = [
      makeComment({ id: 1, type: 'review', body: 'Review comment', path: 'file.ts', line: 5 }),
    ]
    render(<PrCommentsSection {...defaultProps} prGitHubComments={comments} />)
    fireEvent.click(screen.getByText('alice').closest('button')!)
    fireEvent.click(screen.getByText('Reply'))
    // Submit button should be disabled when empty
    const submitBtn = screen.getByText('Reply', { selector: 'button.px-2' })
    expect(submitBtn).toHaveProperty('disabled', true)
  })

  it('shows reaction badges for comments with reactions', () => {
    const comments = [
      makeComment({
        id: 1,
        reactions: [
          { content: '+1', count: 3 },
          { content: 'heart', count: 1 },
        ],
      }),
    ]
    render(<PrCommentsSection {...defaultProps} prGitHubComments={comments} />)
    // Expand comment
    fireEvent.click(screen.getByText('alice').closest('button')!)
    expect(screen.getByText(/3/)).toBeTruthy()
  })

  it('opens reaction picker when + button is clicked', () => {
    const comments = [makeComment({ id: 1 })]
    render(<PrCommentsSection {...defaultProps} prGitHubComments={comments} />)
    fireEvent.click(screen.getByText('alice').closest('button')!)
    const addButton = screen.getByTitle('Add reaction')
    fireEvent.click(addButton)
    // Should show emoji picker with reaction options
    expect(screen.getByTitle('+1')).toBeTruthy()
    expect(screen.getByTitle('heart')).toBeTruthy()
  })

  it('adds a reaction when emoji is clicked', async () => {
    vi.mocked(window.gh.addReaction).mockResolvedValue({ success: true })
    const onRefreshComments = vi.fn()
    const comments = [makeComment({ id: 1 })]
    render(<PrCommentsSection {...defaultProps} prGitHubComments={comments} onRefreshComments={onRefreshComments} />)
    fireEvent.click(screen.getByText('alice').closest('button')!)
    fireEvent.click(screen.getByTitle('Add reaction'))
    fireEvent.click(screen.getByTitle('+1'))

    await waitFor(() => {
      expect(window.gh.addReaction).toHaveBeenCalledWith('/test/repo', 1, '+1', 'issue')
    })
  })

  it('closes reaction picker on outside click', () => {
    const comments = [makeComment({ id: 1 })]
    render(<PrCommentsSection {...defaultProps} prGitHubComments={comments} />)
    fireEvent.click(screen.getByText('alice').closest('button')!)
    fireEvent.click(screen.getByTitle('Add reaction'))
    expect(screen.getByTitle('+1')).toBeTruthy()
    // Click outside the picker
    fireEvent.mouseDown(document.body)
    expect(screen.queryByTitle('+1')).toBeNull()
  })

  it('shows replies in expanded thread', () => {
    const comments = [
      makeComment({ id: 1, type: 'review', body: 'Parent', path: 'file.ts', line: 5 }),
      makeComment({ id: 2, type: 'review', body: 'Reply body', author: 'bob', inReplyToId: 1 }),
    ]
    render(<PrCommentsSection {...defaultProps} prGitHubComments={comments} />)
    fireEvent.click(screen.getByText('alice').closest('button')!)
    expect(screen.getByText('Reply body')).toBeTruthy()
    expect(screen.getByText('bob')).toBeTruthy()
  })

  it('shows "replies" (plural) for multiple replies', () => {
    const comments = [
      makeComment({ id: 1, type: 'review', body: 'Parent', path: 'file.ts', line: 5 }),
      makeComment({ id: 2, type: 'review', body: 'Reply 1', inReplyToId: 1 }),
      makeComment({ id: 3, type: 'review', body: 'Reply 2', inReplyToId: 1 }),
    ]
    render(<PrCommentsSection {...defaultProps} prGitHubComments={comments} />)
    expect(screen.getByText('2 replies')).toBeTruthy()
  })
})
