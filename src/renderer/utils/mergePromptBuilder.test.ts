import { describe, it, expect } from 'vitest'
import { buildMergePrompt } from './mergePromptBuilder'

describe('buildMergePrompt', () => {
  it('generates a merge resolution prompt', () => {
    const result = buildMergePrompt('main')
    expect(result).toContain('Resolve Merge Conflicts')
    expect(result).toContain('main')
    expect(result).toContain('git status')
  })

  it('uses the provided base branch name', () => {
    const result = buildMergePrompt('develop')
    expect(result).toContain('develop')
  })
})
