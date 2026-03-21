// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import '../../../test/react-setup'
import DeleteSessionDialog from './DeleteSessionDialog'
import type { Session } from '../../store/sessions'
import type { ManagedRepo } from '../../../preload/index'

afterEach(() => {
  cleanup()
})

const baseSession = {
  id: 's1',
  name: 'Test Session',
  branch: 'feature/test',
  repoId: 'r1',
  branchStatus: 'active',
  agentId: 'a1',
} as unknown as Session

const repos: ManagedRepo[] = [
  { id: 'r1', name: 'Repo', rootDir: '/repo', defaultBranch: 'main', remoteUrl: '' },
]

describe('DeleteSessionDialog', () => {
  it('renders session name and branch', () => {
    render(
      <DeleteSessionDialog
        session={baseSession}
        repos={repos}
        deleteWorktree={false}
        setDeleteWorktree={vi.fn()}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    )
    expect(screen.getByText(/feature\/test/)).toBeTruthy()
    expect(screen.getByText(/Test Session/)).toBeTruthy()
  })

  it('shows worktree checkbox for managed worktree sessions', () => {
    render(
      <DeleteSessionDialog
        session={baseSession}
        repos={repos}
        deleteWorktree={false}
        setDeleteWorktree={vi.fn()}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    )
    expect(screen.getByText('Delete worktree and folder')).toBeTruthy()
  })

  it('hides worktree checkbox when session is on default branch', () => {
    const mainSession = { ...baseSession, branch: 'main' }
    render(
      <DeleteSessionDialog
        session={mainSession}
        repos={repos}
        deleteWorktree={false}
        setDeleteWorktree={vi.fn()}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    )
    expect(screen.queryByText('Delete worktree and folder')).toBeNull()
  })

  it('shows WIP warning when deleting worktree on active branch', () => {
    render(
      <DeleteSessionDialog
        session={baseSession}
        repos={repos}
        deleteWorktree={true}
        setDeleteWorktree={vi.fn()}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    )
    expect(screen.getByText(/work in progress/)).toBeTruthy()
  })

  it('does not show WIP warning for safe-to-delete sessions', () => {
    const mergedSession = { ...baseSession, branchStatus: 'merged' } as Session
    render(
      <DeleteSessionDialog
        session={mergedSession}
        repos={repos}
        deleteWorktree={true}
        setDeleteWorktree={vi.fn()}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    )
    expect(screen.queryByText(/work in progress/)).toBeNull()
  })

  it('calls onConfirm and onCancel', () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    render(
      <DeleteSessionDialog
        session={baseSession}
        repos={repos}
        deleteWorktree={false}
        setDeleteWorktree={vi.fn()}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    )
    fireEvent.click(screen.getByText('Cancel'))
    expect(onCancel).toHaveBeenCalled()
    fireEvent.click(screen.getByText('Delete'))
    expect(onConfirm).toHaveBeenCalled()
  })
})
