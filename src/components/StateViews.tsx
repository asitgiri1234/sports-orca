import { copyForCode } from "@/lib/errors";

/** Mirrors the summary card plus the first rows, so nothing shifts on load. */
export function LoadingSkeleton() {
  return (
    <div aria-hidden="true" className="mt-8">
      <div className="rounded-xl border border-line bg-surface p-5 sm:p-7">
        <div className="skeleton h-3 w-40" />
        <div className="mt-5 flex flex-col gap-7 sm:flex-row sm:gap-10">
          <div className="shrink-0">
            <div className="skeleton h-12 w-52" />
            <div className="skeleton mt-3 h-3 w-64" />
          </div>
          <div className="flex-1">
            <div className="skeleton h-2 w-full rounded-full" />
            <div className="mt-4 space-y-3">
              <div className="skeleton h-3 w-full" />
              <div className="skeleton h-3 w-full" />
              <div className="skeleton h-3 w-full" />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8 flex items-center justify-between">
        <div className="skeleton h-4 w-20" />
        <div className="skeleton h-8 w-56 rounded-lg" />
      </div>

      <ol className="mt-3 divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
        {Array.from({ length: 6 }, (_, index) => (
          <li key={index} className="p-4 sm:px-5">
            <div className="flex flex-col gap-2.5 sm:flex-row sm:gap-4">
              <div className="flex items-center gap-2 sm:w-24 sm:shrink-0 sm:flex-col sm:items-start">
                <div className="skeleton h-5 w-16 rounded-full" />
                <div className="skeleton h-3 w-10" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="skeleton h-4 w-full max-w-md" />
                <div className="skeleton mt-2 h-3 w-48" />
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

interface ErrorPanelProps {
  code: string | undefined;
  subreddit: string;
  onRetry: () => void;
}

export function ErrorPanel({ code, subreddit, onRetry }: ErrorPanelProps) {
  const copy = copyForCode(code);

  return (
    <div
      role="alert"
      className="mt-8 rounded-xl border border-line bg-surface p-5 sm:p-7"
    >
      <p className="font-mono text-xs text-ink-faint">
        r/{subreddit}
        {code && <span className="ml-2">{code}</span>}
      </p>
      <h2 className="mt-2 text-lg font-semibold text-ink">{copy.title}</h2>
      <p className="mt-2 max-w-prose text-sm leading-relaxed text-ink-soft">
        {copy.body}
      </p>

      {copy.retryable && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-line-strong hover:bg-canvas"
        >
          Try again
        </button>
      )}
    </div>
  );
}

/** First-run state, before any search has been made. */
export function EmptyState() {
  return (
    <div className="mt-8 rounded-xl border border-dashed border-line p-10 text-center">
      <p className="text-sm text-ink-soft">
        Enter a subreddit to score the sentiment of its 50 hottest posts.
      </p>
    </div>
  );
}

/** A real subreddit that simply has no posts right now. */
export function NoPostsState({ subreddit }: { subreddit: string }) {
  return (
    <div className="mt-8 rounded-xl border border-line bg-surface p-7 text-center">
      <h2 className="text-lg font-semibold text-ink">Nothing to score</h2>
      <p className="mt-2 text-sm text-ink-soft">
        r/{subreddit} exists but has no posts in its hot listing right now.
      </p>
    </div>
  );
}
