// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import '../../../../../test/react-setup'
import { SCViewToggle } from './SCViewToggle'

afterEach(() => {
  cleanup()
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('SCViewToggle', () => {
  it('renders all three buttons', () => {
    render(<SCViewToggle scView="working" setScView={vi.fn()} />)
    expect(screen.getByText('Uncommitted')).toBeTruthy()
    expect(screen.getByText('Branch')).toBeTruthy()
    expect(screen.getByText('Commits')).toBeTruthy()
  })

  it('highlights active view button', () => {
    render(<SCViewToggle scView="branch" setScView={vi.fn()} />)
    const branchBtn = screen.getByText('Branch')
    expect(branchBtn.className).toContain('bg-accent')
    const workingBtn = screen.getByText('Uncommitted')
    expect(workingBtn.className).not.toContain('bg-accent')
  })

  it('calls setScView with working when Uncommitted is clicked', () => {
    const setScView = vi.fn()
    render(<SCViewToggle scView="branch" setScView={setScView} />)
    fireEvent.click(screen.getByText('Uncommitted'))
    expect(setScView).toHaveBeenCalledWith('working')
  })

  it('calls setScView with branch when Branch is clicked', () => {
    const setScView = vi.fn()
    render(<SCViewToggle scView="working" setScView={setScView} />)
    fireEvent.click(screen.getByText('Branch'))
    expect(setScView).toHaveBeenCalledWith('branch')
  })

  it('calls setScView with commits when Commits is clicked', () => {
    const setScView = vi.fn()
    render(<SCViewToggle scView="working" setScView={setScView} />)
    fireEvent.click(screen.getByText('Commits'))
    expect(setScView).toHaveBeenCalledWith('commits')
  })
})
