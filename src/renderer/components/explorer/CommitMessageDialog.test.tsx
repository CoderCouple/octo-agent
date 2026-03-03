// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import '../../../test/react-setup'
import { CommitMessageDialog } from './CommitMessageDialog'

afterEach(() => {
  cleanup()
})

describe('CommitMessageDialog', () => {
  it('renders with textarea and buttons', () => {
    render(<CommitMessageDialog onCommit={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText('Commit Message')).toBeTruthy()
    expect(screen.getByPlaceholderText('Enter commit message...')).toBeTruthy()
    expect(screen.getByText('Cancel')).toBeTruthy()
    expect(screen.getByText('Commit')).toBeTruthy()
  })

  it('disables Commit button when message is empty', () => {
    render(<CommitMessageDialog onCommit={vi.fn()} onClose={vi.fn()} />)
    const commitBtn = screen.getByText('Commit')
    expect(commitBtn.hasAttribute('disabled')).toBe(true)
  })

  it('enables Commit button when message is entered', () => {
    render(<CommitMessageDialog onCommit={vi.fn()} onClose={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText('Enter commit message...'), {
      target: { value: 'fix: something' },
    })
    const commitBtn = screen.getByText('Commit')
    expect(commitBtn.hasAttribute('disabled')).toBe(false)
  })

  it('calls onCommit with trimmed message and onClose when submitted', () => {
    const onCommit = vi.fn()
    const onClose = vi.fn()
    render(<CommitMessageDialog onCommit={onCommit} onClose={onClose} />)
    fireEvent.change(screen.getByPlaceholderText('Enter commit message...'), {
      target: { value: '  fix: something  ' },
    })
    fireEvent.click(screen.getByText('Commit'))
    expect(onCommit).toHaveBeenCalledWith('fix: something')
    expect(onClose).toHaveBeenCalled()
  })

  it('calls onClose when Cancel is clicked', () => {
    const onClose = vi.fn()
    render(<CommitMessageDialog onCommit={vi.fn()} onClose={onClose} />)
    fireEvent.click(screen.getByText('Cancel'))
    expect(onClose).toHaveBeenCalled()
  })

  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn()
    render(<CommitMessageDialog onCommit={vi.fn()} onClose={onClose} />)
    fireEvent.keyDown(screen.getByPlaceholderText('Enter commit message...'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('submits on Cmd+Enter', () => {
    const onCommit = vi.fn()
    const onClose = vi.fn()
    render(<CommitMessageDialog onCommit={onCommit} onClose={onClose} />)
    const textarea = screen.getByPlaceholderText('Enter commit message...')
    fireEvent.change(textarea, { target: { value: 'test commit' } })
    fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true })
    expect(onCommit).toHaveBeenCalledWith('test commit')
    expect(onClose).toHaveBeenCalled()
  })

  it('submits on Ctrl+Enter', () => {
    const onCommit = vi.fn()
    const onClose = vi.fn()
    render(<CommitMessageDialog onCommit={onCommit} onClose={onClose} />)
    const textarea = screen.getByPlaceholderText('Enter commit message...')
    fireEvent.change(textarea, { target: { value: 'test commit' } })
    fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true })
    expect(onCommit).toHaveBeenCalledWith('test commit')
    expect(onClose).toHaveBeenCalled()
  })

  it('does not submit on plain Enter', () => {
    const onCommit = vi.fn()
    render(<CommitMessageDialog onCommit={onCommit} onClose={vi.fn()} />)
    const textarea = screen.getByPlaceholderText('Enter commit message...')
    fireEvent.change(textarea, { target: { value: 'test commit' } })
    fireEvent.keyDown(textarea, { key: 'Enter' })
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('does not submit when message is only whitespace', () => {
    const onCommit = vi.fn()
    render(<CommitMessageDialog onCommit={onCommit} onClose={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText('Enter commit message...'), {
      target: { value: '   ' },
    })
    fireEvent.click(screen.getByText('Commit'))
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('closes when clicking backdrop', () => {
    const onClose = vi.fn()
    const { container } = render(<CommitMessageDialog onCommit={vi.fn()} onClose={onClose} />)
    // Click the backdrop (outermost div)
    const backdrop = container.firstElementChild as HTMLElement
    fireEvent.click(backdrop)
    expect(onClose).toHaveBeenCalled()
  })

  it('does not close when clicking dialog content', () => {
    const onClose = vi.fn()
    render(<CommitMessageDialog onCommit={vi.fn()} onClose={onClose} />)
    fireEvent.click(screen.getByText('Commit Message'))
    expect(onClose).not.toHaveBeenCalled()
  })
})
