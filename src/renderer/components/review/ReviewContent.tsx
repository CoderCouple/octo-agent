/**
 * Renders the structured review body including overview, change patterns, issues, and pending comments.
 */
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ReviewData, ReviewComparison, PendingComment, CodeLocation } from '../../types/review'
import type { NormalizedComment } from './useReviewData'
import { CollapsibleSection } from './CollapsibleSection'
import { LocationLink, SeverityBadge, ChangeStatusBadge } from './ReviewHelpers'
import { PrCommentsSection } from './PrComments'

export { PrCommentsSection }

export function MarkdownBody({ content }: { content: string }) {
  return (
    <Markdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ children }) => <h1 className="text-base font-bold mt-3 mb-2 text-text-primary">{children}</h1>,
        h2: ({ children }) => <h2 className="text-sm font-semibold mt-3 mb-1.5 text-text-primary">{children}</h2>,
        h3: ({ children }) => <h3 className="text-sm font-semibold mt-2 mb-1 text-text-primary">{children}</h3>,
        h4: ({ children }) => <h4 className="text-sm font-medium mt-2 mb-1 text-text-primary">{children}</h4>,
        p: ({ children }) => <p className="my-1.5 text-sm text-text-primary leading-relaxed">{children}</p>,
        a: ({ href, children }) => (
          <a
            href={href}
            className="text-accent hover:underline"
            onClick={(e) => {
              e.preventDefault()
              if (href && /^https?:\/\//i.test(href)) void window.shell.openExternal(href)
            }}
          >
            {children}
          </a>
        ),
        code: ({ children, className }) => {
          const isBlock = className?.includes('language-')
          if (isBlock) {
            return <code className="block bg-bg-tertiary p-2 rounded overflow-x-auto text-xs">{children}</code>
          }
          return <code className="bg-bg-tertiary px-1 rounded text-xs">{children}</code>
        },
        pre: ({ children }) => <pre className="bg-bg-tertiary p-2 rounded overflow-x-auto my-1.5">{children}</pre>,
        blockquote: ({ children }) => <blockquote className="border-l-2 border-border pl-3 my-1.5 text-text-secondary italic">{children}</blockquote>,
        ul: ({ children }) => <ul className="list-disc ml-4 my-1.5 text-sm">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal ml-4 my-1.5 text-sm">{children}</ol>,
        li: ({ children }) => <li className="text-text-primary">{children}</li>,
        hr: () => <hr className="border-border my-3" />,
        img: ({ src, alt }) => <img src={src} alt={alt} className="max-w-full my-1.5 rounded" />,
        table: ({ children }) => <table className="border-collapse my-2 w-full">{children}</table>,
        thead: ({ children }) => <thead className="bg-bg-tertiary">{children}</thead>,
        tbody: ({ children }) => <tbody>{children}</tbody>,
        tr: ({ children }) => <tr className="border-b border-border">{children}</tr>,
        th: ({ children }) => <th className="px-2 py-1 text-left text-xs font-semibold text-text-primary border border-border">{children}</th>,
        td: ({ children }) => <td className="px-2 py-1 text-xs text-text-primary border border-border">{children}</td>,
      }}
    >
      {content}
    </Markdown>
  )
}

function SinceLastReviewSection({ data }: { data: NonNullable<ReviewData['changesSinceLastReview']> }) {
  return (
    <CollapsibleSection title="Since Last Review" defaultOpen={true}>
      <div className="space-y-3">
        <div className="text-sm text-text-primary leading-relaxed">{data.summary}</div>
        {data.responsesToComments.length > 0 && (
          <div>
            <div className="text-xs font-medium text-text-secondary mb-1">Responses to Comments</div>
            <div className="space-y-1.5">
              {data.responsesToComments.map((item, i) => (
                <div key={i} className="text-sm rounded border border-border bg-bg-primary p-2">
                  <div className="text-text-secondary text-xs">{item.comment}</div>
                  <div className="text-text-primary mt-0.5">{item.response}</div>
                </div>
              ))}
            </div>
          </div>
        )}
        {data.otherNotableChanges.length > 0 && (
          <div>
            <div className="text-xs font-medium text-text-secondary mb-1">Other Notable Changes</div>
            <ul className="list-disc list-inside text-sm text-text-primary space-y-0.5">
              {data.otherNotableChanges.map((change, i) => (
                <li key={i}>{change}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </CollapsibleSection>
  )
}

export interface ReviewContentProps {
  reviewData: ReviewData
  comparison: ReviewComparison | null
  comments: PendingComment[]
  unpushedCount: number
  directory: string
  prDescription: string | null
  prGitHubComments: NormalizedComment[]
  prCommentsLoading: boolean
  prCommentsHasMore: boolean
  onLoadOlderComments: () => void
  onClickLocation: (location: CodeLocation) => void
  onDeleteComment: (commentId: string) => void
  repoDir: string
  prNumber: number
  onRefreshComments: () => void
}

export function ReviewContent({
  reviewData,
  comparison,
  comments,
  unpushedCount,
  directory,
  prDescription,
  prGitHubComments,
  prCommentsLoading,
  prCommentsHasMore,
  onLoadOlderComments,
  onClickLocation,
  onDeleteComment,
  repoDir,
  prNumber,
  onRefreshComments,
}: ReviewContentProps) {
  return (
    <>
      {/* Changes Since Last Review */}
      {comparison && comparison.requestedChangeStatus.length > 0 && (
        <CollapsibleSection title="Changes Since Last Review" count={comparison.requestedChangeStatus.length} defaultOpen={true}>
          <div className="space-y-2">
            <div className="text-sm text-text-primary mb-2">
              Status of previously requested changes:
            </div>
            {comparison.requestedChangeStatus.map((item, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                <ChangeStatusBadge status={item.status} />
                <div className="flex-1">
                  <div className="text-text-primary">{item.change.description}</div>
                  {item.notes && (
                    <div className="text-xs text-text-secondary mt-0.5">{item.notes}</div>
                  )}
                </div>
              </div>
            ))}
            {comparison.newCommitsSince.length > 0 && (
              <div className="text-xs text-text-secondary mt-2 pt-2 border-t border-border">
                {comparison.newCommitsSince.length} new commit{comparison.newCommitsSince.length !== 1 ? 's' : ''} since last review
              </div>
            )}
          </div>
        </CollapsibleSection>
      )}

      {reviewData.changesSinceLastReview && (
        <SinceLastReviewSection data={reviewData.changesSinceLastReview} />
      )}

      {prDescription && (
        <CollapsibleSection title="PR Description" defaultOpen={false}>
          <MarkdownBody content={prDescription} />
        </CollapsibleSection>
      )}

      <CollapsibleSection title="Overview" defaultOpen={true}>
        <div className="space-y-3">
          <div>
            <div className="text-xs font-medium text-text-secondary mb-1">Purpose</div>
            <div className="text-sm text-text-primary leading-relaxed">{reviewData.overview.purpose}</div>
          </div>
          <div>
            <div className="text-xs font-medium text-text-secondary mb-1">Approach</div>
            <div className="text-sm text-text-primary leading-relaxed">{reviewData.overview.approach}</div>
          </div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Change Patterns" count={reviewData.changePatterns.length}>
        <div className="space-y-3">
          {reviewData.changePatterns.map((pattern) => (
            <div key={pattern.id} className="text-sm">
              <div className="font-medium text-text-primary">{pattern.title}</div>
              <div className="text-text-secondary mt-0.5 leading-relaxed">{pattern.description}</div>
              {pattern.locations.length > 0 && (
                <div className="mt-1 space-y-0.5">
                  {pattern.locations.map((loc, i) => (
                    <LocationLink key={i} location={loc} directory={directory} onClick={() => onClickLocation(loc)} />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </CollapsibleSection>

      {reviewData.potentialIssues.length > 0 && (
        <CollapsibleSection title="Potential Issues" count={reviewData.potentialIssues.length}>
          <div className="space-y-3">
            {reviewData.potentialIssues.map((issue) => (
              <div key={issue.id} className="text-sm">
                <div className="flex items-center gap-2">
                  <SeverityBadge severity={issue.severity} />
                  <span className="font-medium text-text-primary">{issue.title}</span>
                </div>
                <div className="text-text-secondary mt-0.5 leading-relaxed">{issue.description}</div>
                {issue.locations.length > 0 && (
                  <div className="mt-1 space-y-0.5">
                    {issue.locations.map((loc, i) => (
                      <LocationLink key={i} location={loc} directory={directory} onClick={() => onClickLocation(loc)} />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}

      {reviewData.designDecisions.length > 0 && (
        <CollapsibleSection title="Design Decisions" count={reviewData.designDecisions.length}>
          <div className="space-y-3">
            {reviewData.designDecisions.map((decision) => (
              <div key={decision.id} className="text-sm">
                <div className="font-medium text-text-primary">{decision.title}</div>
                <div className="text-text-secondary mt-0.5 leading-relaxed">{decision.description}</div>
                {decision.alternatives && decision.alternatives.length > 0 && (
                  <div className="text-xs text-text-secondary mt-1">
                    <span className="font-medium">Alternatives: </span>
                    {decision.alternatives.join(', ')}
                  </div>
                )}
                {decision.locations.length > 0 && (
                  <div className="mt-1 space-y-0.5">
                    {decision.locations.map((loc, i) => (
                      <LocationLink key={i} location={loc} directory={directory} onClick={() => onClickLocation(loc)} />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}

      {comments.length > 0 && (
        <CollapsibleSection title="Pending Comments" count={unpushedCount}>
          <div className="space-y-2">
            {comments.map((comment) => (
              <div key={comment.id} className="rounded border border-border bg-bg-primary p-2">
                <div className="flex items-center gap-2 mb-1">
                  <button
                    onClick={() => onClickLocation({ file: comment.file, startLine: comment.line })}
                    className="text-xs text-accent hover:text-accent/80 font-mono truncate transition-colors"
                  >
                    {comment.file.split('/').pop()}:{comment.line}
                  </button>
                  {comment.pushed && (
                    <span className="text-[10px] px-1 py-0.5 rounded bg-green-500/20 text-green-400">pushed</span>
                  )}
                  <button
                    onClick={() => onDeleteComment(comment.id)}
                    className="ml-auto text-text-secondary hover:text-red-400 transition-colors"
                    title="Delete comment"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 6L6 18" />
                      <path d="M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="text-sm text-text-primary">{comment.body}</div>
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}

      {prGitHubComments.length > 0 && (
        <PrCommentsSection
          prGitHubComments={prGitHubComments}
          prCommentsLoading={prCommentsLoading}
          prCommentsHasMore={prCommentsHasMore}
          onLoadOlderComments={onLoadOlderComments}
          onClickLocation={onClickLocation}
          repoDir={repoDir}
          prNumber={prNumber}
          onRefreshComments={onRefreshComments}
        />
      )}
    </>
  )
}
