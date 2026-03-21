// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import '../../../../test/react-setup'
import FindBar from './FindBar'

afterEach(() => { cleanup() })

describe('FindBar', () => {
  it('renders input with placeholder', () => {
    render(<FindBar query="" onQueryChange={vi.fn()} onNext={vi.fn()} onPrevious={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByPlaceholderText('Find in page...')).toBeTruthy()
  })

  it('calls onQueryChange when typing', () => {
    const onQueryChange = vi.fn()
    render(<FindBar query="" onQueryChange={onQueryChange} onNext={vi.fn()} onPrevious={vi.fn()} onClose={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText('Find in page...'), { target: { value: 'test' } })
    expect(onQueryChange).toHaveBeenCalledWith('test')
  })

  it('calls onClose on Escape', () => {
    const onClose = vi.fn()
    render(<FindBar query="test" onQueryChange={vi.fn()} onNext={vi.fn()} onPrevious={vi.fn()} onClose={onClose} />)
    fireEvent.keyDown(screen.getByPlaceholderText('Find in page...'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('calls onNext on Enter', () => {
    const onNext = vi.fn()
    render(<FindBar query="test" onQueryChange={vi.fn()} onNext={onNext} onPrevious={vi.fn()} onClose={vi.fn()} />)
    fireEvent.keyDown(screen.getByPlaceholderText('Find in page...'), { key: 'Enter' })
    expect(onNext).toHaveBeenCalled()
  })

  it('calls onPrevious on Shift+Enter', () => {
    const onPrevious = vi.fn()
    render(<FindBar query="test" onQueryChange={vi.fn()} onNext={vi.fn()} onPrevious={onPrevious} onClose={vi.fn()} />)
    fireEvent.keyDown(screen.getByPlaceholderText('Find in page...'), { key: 'Enter', shiftKey: true })
    expect(onPrevious).toHaveBeenCalled()
  })

  it('shows match info when provided', () => {
    render(<FindBar query="test" onQueryChange={vi.fn()} onNext={vi.fn()} onPrevious={vi.fn()} onClose={vi.fn()} matchInfo={{ active: 2, total: 5 }} />)
    expect(screen.getByText('2/5')).toBeTruthy()
  })

  it('shows "No results" when total is 0', () => {
    render(<FindBar query="test" onQueryChange={vi.fn()} onNext={vi.fn()} onPrevious={vi.fn()} onClose={vi.fn()} matchInfo={{ active: 0, total: 0 }} />)
    expect(screen.getByText('No results')).toBeTruthy()
  })

  it('calls onPrevious and onNext via buttons', () => {
    const onPrevious = vi.fn()
    const onNext = vi.fn()
    render(<FindBar query="test" onQueryChange={vi.fn()} onNext={onNext} onPrevious={onPrevious} onClose={vi.fn()} />)
    fireEvent.click(screen.getByTitle('Previous match (Shift+Enter)'))
    expect(onPrevious).toHaveBeenCalled()
    fireEvent.click(screen.getByTitle('Next match (Enter)'))
    expect(onNext).toHaveBeenCalled()
  })

  it('calls onClose via close button', () => {
    const onClose = vi.fn()
    render(<FindBar query="test" onQueryChange={vi.fn()} onNext={vi.fn()} onPrevious={vi.fn()} onClose={onClose} />)
    fireEvent.click(screen.getByTitle('Close (Esc)'))
    expect(onClose).toHaveBeenCalled()
  })
})
