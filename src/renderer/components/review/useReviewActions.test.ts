// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'
import '../../../test/react-setup'

import { useReviewActions } from './useReviewActions'
import type { Session } from '../../store/sessions'
import type { ReviewDataState } from './useReviewData'

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'session-1',
    name: 'test',
    directory: '/test/repo',
    branch: 'feature/review',
    status: 'idle',
    agentId: 'agent-1',
    agentPtyId: 'pty-1',
    panelVisibility: {},
    showExplorer: true,
    showFileViewer: false,
    showDiff: false,
    selectedFilePath: null,
    planFilePath: null,
    fileViewerPosition: 'top',
    layoutSizes: {
      explorerWidth: 256,
      fileViewerSize: 300,
      userTerminalHeight: 192,
      diffPanelWidth: 320,
      tutorialPanelWidth: 320,
    },
    explorerFilter: 'files',
    lastMessage: null,
    lastMessageTime: null,
    isUnread: false,
    workingStartTime: null,
    recentFiles: [],
    terminalTabs: { tabs: [{ id: 'tab-1', name: 'Terminal' }], activeTabId: 'tab-1' },
    branchStatus: 'in-progress',
    isArchived: false,
    isRestored: false,
    prNumber: 42,
    prUrl: 'https://github.com/pr/42',
    prBaseBranch: 'main',
    ...overrides,
  }
}

function makeState(overrides: Partial<ReviewDataState> = {}): ReviewDataState {
  return {
    reviewMarkdown: null,
    fetching: false,
    waitingForAgent: false,
    fetchingStatus: null,
    error: null,
    mergeBase: 'abc123',
    broomyDir: '/test/repo/.broomy',
    outputDir: '/test/repo/.broomy/output',
    reviewFilePath: '/test/repo/.broomy/output/review.md',
    promptFilePath: '/test/repo/.broomy/output/review-prompt.md',
    setReviewMarkdown: vi.fn(),
    setFetching: vi.fn(),
    setWaitingForAgent: vi.fn(),
    setFetchingStatus: vi.fn(),
    setError: vi.fn(),
    setMergeBase: vi.fn(),
    ...overrides,
  }
}

afterEach(() => {
  cleanup()
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useReviewActions', () => {
  it('handleOpenPrUrl opens the PR URL', () => {
    const session = makeSession()
    const onSelectFile = vi.fn()
    const state = makeState()

    const { result } = renderHook(() =>
      useReviewActions(session, undefined, onSelectFile, state)
    )

    act(() => {
      result.current.handleOpenPrUrl()
    })

    expect(onSelectFile).toHaveBeenCalledWith('https://github.com/pr/42', false)
  })

  it('handleWritePrompt ignores non-review builders', async () => {
    const state = makeState()
    const { result } = renderHook(() =>
      useReviewActions(makeSession(), undefined, vi.fn(), state)
    )

    await act(async () => {
      await result.current.handleWritePrompt('create-pr', '/test/output.md')
    })

    expect(state.setFetching).not.toHaveBeenCalled()
  })

  it('handleWritePrompt fetches base branch before generating', async () => {
    vi.mocked(window.fs.exists).mockResolvedValue(false)

    const state = makeState()
    const session = makeSession({ prBaseBranch: 'develop' })

    const { result } = renderHook(() =>
      useReviewActions(session, undefined, vi.fn(), state)
    )

    await act(async () => {
      await result.current.handleWritePrompt('review', '/test/repo/.broomy/output/review-prompt.md')
    })

    expect(window.git.fetchBranch).toHaveBeenCalledWith('/test/repo', 'develop')
  })

  it('handleWritePrompt pulls PR branch when prNumber is set', async () => {
    vi.mocked(window.fs.exists).mockResolvedValue(false)
    vi.mocked(window.git.getBranch).mockResolvedValue('feature/review')

    const state = makeState()
    const session = makeSession({ prNumber: 42 })

    const { result } = renderHook(() =>
      useReviewActions(session, undefined, vi.fn(), state)
    )

    await act(async () => {
      await result.current.handleWritePrompt('review', '/test/repo/.broomy/output/review-prompt.md')
    })

    expect(window.git.syncReviewBranch).toHaveBeenCalledWith('/test/repo', 'feature/review', 42)
  })

  it('handleWritePrompt writes review prompt', async () => {
    vi.mocked(window.fs.exists).mockResolvedValue(false)
    vi.mocked(window.fs.mkdir).mockResolvedValue({ success: true })

    const state = makeState()
    const session = makeSession()

    const { result } = renderHook(() =>
      useReviewActions(session, undefined, vi.fn(), state)
    )

    await act(async () => {
      await result.current.handleWritePrompt('review', '/test/repo/.broomy/output/review-prompt.md')
    })

    expect(window.fs.writeFile).toHaveBeenCalledWith(
      '/test/repo/.broomy/output/review-prompt.md',
      expect.stringContaining('PR Review')
    )
  })

  it('handleWritePrompt writes context.json with PR info', async () => {
    vi.mocked(window.fs.exists).mockResolvedValue(false)
    vi.mocked(window.fs.mkdir).mockResolvedValue({ success: true })

    const state = makeState()
    const session = makeSession({ prNumber: 42, prBaseBranch: 'main', prUrl: 'https://github.com/pr/42' })

    const { result } = renderHook(() =>
      useReviewActions(session, undefined, vi.fn(), state)
    )

    await act(async () => {
      await result.current.handleWritePrompt('review', '/test/repo/.broomy/output/review-prompt.md')
    })

    expect(window.fs.writeFile).toHaveBeenCalledWith(
      '/test/repo/.broomy/output/context.json',
      expect.stringContaining('"prNumber": 42')
    )
  })

  it('handleWritePrompt sets fetching and waitingForAgent states', async () => {
    vi.mocked(window.fs.exists).mockResolvedValue(false)

    const state = makeState()
    const session = makeSession()

    const { result } = renderHook(() =>
      useReviewActions(session, undefined, vi.fn(), state)
    )

    await act(async () => {
      await result.current.handleWritePrompt('review', '/test/repo/.broomy/output/review-prompt.md')
    })

    expect(state.setFetching).toHaveBeenCalledWith(true)
    expect(state.setWaitingForAgent).toHaveBeenCalledWith(true)
    expect(state.setFetchingStatus).toHaveBeenCalledWith('sent')
  })

  it('handleWritePrompt handles errors', async () => {
    vi.mocked(window.fs.exists).mockResolvedValue(false)
    vi.mocked(window.fs.mkdir).mockRejectedValue(new Error('mkdir failed'))

    const state = makeState()
    const session = makeSession()

    const { result } = renderHook(() =>
      useReviewActions(session, undefined, vi.fn(), state)
    )

    await act(async () => {
      await result.current.handleWritePrompt('review', '/test/repo/.broomy/output/review-prompt.md')
    })

    expect(state.setError).toHaveBeenCalledWith('mkdir failed')
    expect(state.setWaitingForAgent).toHaveBeenCalledWith(false)
  })

  it('handleOpenPrUrl does nothing when no prUrl', () => {
    const openSpy = vi.fn()
    vi.stubGlobal('open', openSpy)

    const session = makeSession({ prUrl: undefined })
    const state = makeState()

    const { result } = renderHook(() =>
      useReviewActions(session, undefined, vi.fn(), state)
    )

    act(() => {
      result.current.handleOpenPrUrl()
    })

    expect(openSpy).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})
