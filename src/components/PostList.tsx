"use client";

import { useMemo } from "react";

import type { ScoredPost, SentimentLabel } from "@/lib/types";
import { formatCompound, formatCount, formatRelativeTime } from "@/lib/verdict";

export type SortMode = "hot" | "positive" | "negative";

export const SORT_OPTIONS: Array<{ value: SortMode; label: string }> = [
  { value: "hot", label: "Hot order" },
  { value: "positive", label: "Most positive" },
  { value: "negative", label: "Most negative" },
];

const BADGE: Record<SentimentLabel, string> = {
  positive: "border-positive/30 bg-positive-wash text-positive",
  negative: "border-negative/30 bg-negative-wash text-negative",
  neutral: "border-line bg-flat-wash text-flat",
};

const BADGE_LABEL: Record<SentimentLabel, string> = {
  positive: "Positive",
  negative: "Negative",
  neutral: "Neutral",
};

function sortPosts(posts: ScoredPost[], mode: SortMode): ScoredPost[] {
  // Reddit's own ordering is meaningful, so "hot" must be the untouched array.
  if (mode === "hot") return posts;

  const copy = [...posts];
  copy.sort((a, b) =>
    mode === "positive"
      ? b.sentiment.compound - a.sentiment.compound
      : a.sentiment.compound - b.sentiment.compound,
  );
  return copy;
}

interface PostListProps {
  posts: ScoredPost[];
  sort: SortMode;
  onSortChange: (sort: SortMode) => void;
}

export function PostList({ posts, sort, onSortChange }: PostListProps) {
  const sorted = useMemo(() => sortPosts(posts, sort), [posts, sort]);

  return (
    <section aria-labelledby="posts-heading" className="mt-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 id="posts-heading" className="text-sm font-semibold text-ink">
          Posts
          <span className="ml-2 font-normal text-ink-faint">{posts.length}</span>
        </h2>

        <div
          role="group"
          aria-label="Sort posts"
          className="flex rounded-lg border border-line bg-surface p-0.5"
        >
          {SORT_OPTIONS.map((option) => {
            const isActive = option.value === sort;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={isActive}
                onClick={() => onSortChange(option.value)}
                className={`flex-1 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors sm:flex-none ${
                  isActive
                    ? "bg-accent-wash text-accent"
                    : "text-ink-soft hover:text-ink"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      <ol className="mt-3 divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
        {sorted.map((post) => (
          <PostRow key={post.id} post={post} />
        ))}
      </ol>
    </section>
  );
}

function PostRow({ post }: { post: ScoredPost }) {
  const { label, compound, topTokens } = post.sentiment;

  return (
    <li className="p-4 transition-colors hover:bg-canvas sm:px-5">
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:gap-4">
        {/* Score rail: above the title on mobile, beside it from sm up. */}
        <div className="flex items-center gap-2 sm:w-24 sm:shrink-0 sm:flex-col sm:items-start sm:gap-1.5">
          <span
            className={`inline-flex shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ${BADGE[label]}`}
          >
            {BADGE_LABEL[label]}
          </span>
          <span className="font-mono text-xs tabular-nums text-ink-faint">
            {formatCompound(compound)}
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <a
            href={post.permalink}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[0.9375rem] leading-snug text-ink underline-offset-2 hover:text-accent hover:underline"
          >
            {post.title}
          </a>

          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-faint">
            <span className="font-mono tabular-nums">
              {formatCount(post.score)} upvotes
            </span>
            <span aria-hidden="true">&middot;</span>
            <span className="font-mono tabular-nums">
              {formatCount(post.numComments)} comments
            </span>
            <span aria-hidden="true">&middot;</span>
            <span className="truncate">u/{post.author}</span>
            {post.createdUtc > 0 && (
              <>
                <span aria-hidden="true">&middot;</span>
                <span>{formatRelativeTime(post.createdUtc)}</span>
              </>
            )}
            {post.flair && (
              <span className="rounded border border-line px-1.5 py-0.5 text-ink-soft">
                {post.flair}
              </span>
            )}
          </div>

          {topTokens.length > 0 ? (
            <details className="group mt-2">
              <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-xs text-ink-faint transition-colors hover:text-accent [&::-webkit-details-marker]:hidden">
                <span
                  aria-hidden="true"
                  className="transition-transform group-open:rotate-90"
                >
                  &rsaquo;
                </span>
                Why this score?
              </summary>

              <div className="mt-2 rounded-lg border border-line bg-canvas p-3">
                <ul className="space-y-1.5">
                  {topTokens.map((token) => (
                    <li
                      key={token.token}
                      className="flex items-baseline justify-between gap-3 text-xs"
                    >
                      <span className="min-w-0 truncate font-mono text-ink">
                        {token.token}
                      </span>
                      <span
                        className={`shrink-0 font-mono tabular-nums ${
                          token.contribution > 0 ? "text-positive" : "text-negative"
                        }`}
                      >
                        {formatCompound(token.contribution)}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2.5 border-t border-line pt-2 text-[0.6875rem] leading-relaxed text-ink-faint">
                  Each number is how far the compound score moves when that word
                  is removed from the title, so negators and intensifiers are
                  credited in context rather than by dictionary value.
                </p>
              </div>
            </details>
          ) : (
            <p className="mt-2 text-xs text-ink-faint">
              No words from the sentiment lexicon appear in this title.
            </p>
          )}
        </div>
      </div>
    </li>
  );
}
