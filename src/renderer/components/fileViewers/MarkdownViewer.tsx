/**
 * Markdown preview viewer using react-markdown with GitHub Flavored Markdown support.
 *
 * Renders markdown content with dark-theme-styled custom components for headings,
 * links, code blocks, blockquotes, tables, images, and lists. Uses remark-gfm for
 * tables, strikethrough, and other GFM extensions. Registered at higher priority than
 * Monaco for .md/.markdown/.mdx files so preview is the default view.
 */
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { FileViewerPlugin, FileViewerComponentProps } from './types'
import { matchesExtensions } from './types'
import { createMarkdownComponents } from '../../utils/markdownComponents'

const MARKDOWN_EXTENSIONS = ['md', 'markdown', 'mdx']
const markdownComponents = createMarkdownComponents('default')

function MarkdownViewerComponent({ content }: FileViewerComponentProps) {
  return (
    <div className="h-full overflow-auto p-4 bg-bg-primary">
      <div className="max-w-3xl mx-auto prose prose-invert prose-sm">
        <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
          {content}
        </Markdown>
      </div>
    </div>
  )
}

export const MarkdownViewer: FileViewerPlugin = {
  id: 'markdown',
  name: 'Preview',
  icon: (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  ),
  canHandle: (filePath: string) => matchesExtensions(filePath, MARKDOWN_EXTENSIONS),
  priority: 50, // Higher than Monaco for markdown files
  component: MarkdownViewerComponent,
}
