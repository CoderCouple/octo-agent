// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react'
import '../../../test/react-setup'
import ContainerInfoPanel from './ContainerInfoPanel'

afterEach(() => { cleanup() })
beforeEach(() => { vi.clearAllMocks() })

describe('ContainerInfoPanel', () => {
  it('shows loading state initially', () => {
    vi.mocked(window.devcontainer.containerInfo).mockReturnValue(new Promise(() => {}))
    render(<ContainerInfoPanel repoDir="/repo" />)
    expect(screen.getByText('Loading...')).toBeTruthy()
  })

  it('shows no container message when info is null', async () => {
    vi.mocked(window.devcontainer.containerInfo).mockResolvedValue(null as never)
    await act(async () => {
      render(<ContainerInfoPanel repoDir="/repo" />)
    })
    expect(screen.getByText(/No container running/)).toBeTruthy()
  })

  it('shows container info when running', async () => {
    vi.mocked(window.devcontainer.containerInfo).mockResolvedValue({
      status: 'running',
      containerId: 'abc123',
      repoDir: '/repo',
    } as never)
    await act(async () => {
      render(<ContainerInfoPanel repoDir="/repo" />)
    })
    expect(screen.getByText('running')).toBeTruthy()
    expect(screen.getByText('abc123')).toBeTruthy()
  })

  it('calls refresh on button click', async () => {
    vi.mocked(window.devcontainer.containerInfo).mockResolvedValue({
      status: 'running',
      containerId: 'abc123',
      repoDir: '/repo',
    } as never)
    await act(async () => {
      render(<ContainerInfoPanel repoDir="/repo" />)
    })
    vi.mocked(window.devcontainer.containerInfo).mockClear()
    await act(async () => {
      fireEvent.click(screen.getByText('Refresh'))
    })
    expect(window.devcontainer.containerInfo).toHaveBeenCalledWith('/repo')
  })

  it('handles error from containerInfo', async () => {
    vi.mocked(window.devcontainer.containerInfo).mockRejectedValue(new Error('fail'))
    await act(async () => {
      render(<ContainerInfoPanel repoDir="/repo" />)
    })
    expect(screen.getByText(/No container running/)).toBeTruthy()
  })
})
