/**
 * Shared Markdown component factories for react-markdown.
 *
 * Provides reusable component overrides for dark-themed Markdown rendering
 * with safe external link handling. Two size presets are available:
 * - 'default': Larger text for standalone markdown file viewing
 * - 'compact': Smaller text for embedded panels (e.g., review content)
 */
import type { Components } from 'react-markdown'

type SizePreset = 'default' | 'compact'

const SIZES = {
  default: {
    h1: 'text-2xl font-bold mt-6 mb-4',
    h2: 'text-xl font-semibold mt-5 mb-3',
    h3: 'text-lg font-semibold mt-4 mb-2',
    h4: 'text-base font-semibold mt-4 mb-2',
    p: 'my-2',
    code: { block: 'p-3 text-sm', inline: 'text-sm' },
    pre: 'p-3 my-2',
    blockquote: 'border-l-4 pl-4 my-2',
    list: 'ml-4 my-2',
    hr: 'my-4',
    img: 'my-2',
    table: 'my-3',
    th: 'px-3 py-1.5 text-xs',
    td: 'px-3 py-1.5 text-xs',
  },
  compact: {
    h1: 'text-base font-bold mt-3 mb-2',
    h2: 'text-sm font-semibold mt-3 mb-1.5',
    h3: 'text-sm font-semibold mt-2 mb-1',
    h4: 'text-sm font-medium mt-2 mb-1',
    p: 'my-1.5 text-sm leading-relaxed',
    code: { block: 'p-2 text-xs', inline: 'text-xs' },
    pre: 'p-2 my-1.5',
    blockquote: 'border-l-2 pl-3 my-1.5',
    list: 'ml-4 my-1.5 text-sm',
    hr: 'my-3',
    img: 'my-1.5',
    table: 'my-2',
    th: 'px-2 py-1 text-xs',
    td: 'px-2 py-1 text-xs',
  },
} as const

function handleLinkClick(e: React.MouseEvent, href: string | undefined) {
  e.preventDefault()
  if (href && /^https?:\/\//i.test(href)) void window.shell.openExternal(href)
}

export function createMarkdownComponents(size: SizePreset = 'default'): Components {
  const s = SIZES[size]
  return {
    h1: ({ children }) => <h1 className={`${s.h1} text-text-primary`}>{children}</h1>,
    h2: ({ children }) => <h2 className={`${s.h2} text-text-primary`}>{children}</h2>,
    h3: ({ children }) => <h3 className={`${s.h3} text-text-primary`}>{children}</h3>,
    h4: ({ children }) => <h4 className={`${s.h4} text-text-primary`}>{children}</h4>,
    p: ({ children }) => <p className={`${s.p} text-text-primary`}>{children}</p>,
    a: ({ href, children }) => (
      <a href={href} className="text-accent hover:underline" onClick={(e) => handleLinkClick(e, href)}>
        {children}
      </a>
    ),
    code: ({ children, className }) => {
      const isBlock = className?.includes('language-')
      if (isBlock) {
        return <code className={`block bg-bg-tertiary ${s.code.block} rounded overflow-x-auto`}>{children}</code>
      }
      return <code className={`bg-bg-tertiary px-1 rounded ${s.code.inline}`}>{children}</code>
    },
    pre: ({ children }) => <pre className={`bg-bg-tertiary ${s.pre} rounded overflow-x-auto`}>{children}</pre>,
    blockquote: ({ children }) => <blockquote className={`${s.blockquote} border-border text-text-secondary italic`}>{children}</blockquote>,
    ul: ({ children }) => <ul className={`list-disc ${s.list}`}>{children}</ul>,
    ol: ({ children }) => <ol className={`list-decimal ${s.list}`}>{children}</ol>,
    li: ({ children }) => <li className="text-text-primary">{children}</li>,
    hr: () => <hr className={`border-border ${s.hr}`} />,
    img: ({ src, alt }) => <img src={src} alt={alt} className={`max-w-full ${s.img} rounded`} />,
    table: ({ children }) => <table className={`border-collapse ${s.table} w-full`}>{children}</table>,
    thead: ({ children }) => <thead className="bg-bg-tertiary">{children}</thead>,
    tbody: ({ children }) => <tbody>{children}</tbody>,
    tr: ({ children }) => <tr className="border-b border-border">{children}</tr>,
    th: ({ children }) => <th className={`${s.th} text-left font-semibold text-text-primary border border-border`}>{children}</th>,
    td: ({ children }) => <td className={`${s.td} text-text-primary border border-border`}>{children}</td>,
  }
}
