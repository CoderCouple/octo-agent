/**
 * Hook for keyboard navigation (arrow keys + Enter) over a list of items.
 */
import { useState, useEffect, useRef, useMemo } from 'react'

export function useListKeyboardNav<T>({
  items,
  enabled = true,
  onSelect,
  dataAttribute,
}: {
  items: T[]
  enabled?: boolean
  onSelect: (item: T) => void
  dataAttribute: string
}) {
  const [focusedIndex, setFocusedIndex] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)
  const count = items.length
  const clamped = useMemo(() => Math.min(focusedIndex, Math.max(0, count - 1)), [focusedIndex, count])

  // Scroll focused item into view
  useEffect(() => {
    if (!listRef.current || count === 0) return
    const item = listRef.current.querySelectorAll(`[${dataAttribute}]`)[clamped] as HTMLElement | undefined
    if (item && 'scrollIntoView' in item) item.scrollIntoView({ block: 'nearest' })
  }, [clamped, count, dataAttribute])

  useEffect(() => {
    if (!enabled || count === 0) return

    const handleKeyDown = (e: KeyboardEvent) => {
      // Allow arrow keys and Enter even in inputs (e.g. search boxes)
      if (e.target instanceof HTMLInputElement && e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Enter') return

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        e.stopImmediatePropagation()
        setFocusedIndex((i) => Math.min(i + 1, count - 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        e.stopImmediatePropagation()
        setFocusedIndex((i) => Math.max(i - 1, 0))
        return
      }
      if (e.key === 'Enter' && items[clamped] !== undefined) {
        e.preventDefault()
        e.stopImmediatePropagation()
        onSelect(items[clamped])
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [enabled, count, clamped, items, onSelect])

  return { focusedIndex: clamped, setFocusedIndex, listRef }
}
