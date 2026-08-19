"use client";

import { useCallback, useRef, useState } from "react";

import { DistributionCharts } from "@/components/DistributionCharts";
import { MethodologyNote } from "@/components/MethodologyNote";
import { PostList, type SortMode } from "@/components/PostList";
import { SearchBar } from "@/components/SearchBar";
import { SummaryCard } from "@/components/SummaryCard";
import {
  EmptyState,
  ErrorPanel,
  LoadingSkeleton,
  NoPostsState,
} from "@/components/StateViews";
import type { SubredditPostsResponse } from "@/lib/types";

type Status =
  | { phase: "idle" }
  | { phase: "loading"; subreddit: string }
  | { phase: "ready"; data: SubredditPostsResponse }
  | { phase: "error"; subreddit: string; code: string | undefined };

export function Dashboard() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<Status>({ phase: "idle" });
  const [sort, setSort] = useState<SortMode>("hot");

  // Guards against a slow earlier request landing after a newer one.
  const requestId = useRef(0);

  const search = useCallback(async (rawName: string) => {
    const name = rawName.trim().replace(/^\/?r\//i, "");
    if (name.length === 0) return;

    const id = ++requestId.current;
    setStatus({ phase: "loading", subreddit: name });
    setSort("hot");

    try {
      const response = await fetch(`/api/subreddit/${encodeURIComponent(name)}`);
      const body: unknown = await response.json().catch(() => null);

      if (id !== requestId.current) return;

      if (!response.ok) {
        const code =
          body && typeof body === "object" && "code" in body
            ? String((body as { code: unknown }).code)
            : undefined;
        setStatus({ phase: "error", subreddit: name, code });
        return;
      }

      setStatus({ phase: "ready", data: body as SubredditPostsResponse });
    } catch {
      if (id !== requestId.current) return;
      // fetch() itself failed - the browser could not reach our own route.
      setStatus({ phase: "error", subreddit: name, code: "NETWORK_ERROR" });
    }
  }, []);

  const activeSubreddit =
    status.phase === "ready"
      ? status.data.subreddit
      : status.phase === "loading" || status.phase === "error"
        ? status.subreddit
        : null;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-16">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
          The Subreddit Vibe Check
        </h1>
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-ink-soft">
          Scores the titles of a subreddit&rsquo;s 50 hottest posts with VADER
          sentiment analysis, and shows what is driving the result.
        </p>
      </header>

      <div className="mt-8">
        <SearchBar
          value={query}
          onChange={setQuery}
          onSubmit={search}
          disabled={status.phase === "loading"}
          activeSubreddit={activeSubreddit}
        />
      </div>

      {/* Announce state changes without stealing focus. */}
      <div aria-live="polite" className="sr-only">
        {status.phase === "loading" && `Loading r/${status.subreddit}`}
        {status.phase === "ready" &&
          `Loaded ${status.data.count} posts from r/${status.data.subreddit}`}
        {status.phase === "error" && `Could not load r/${status.subreddit}`}
      </div>

      {status.phase === "idle" && <EmptyState />}

      {status.phase === "loading" && <LoadingSkeleton />}

      {status.phase === "error" && (
        <ErrorPanel
          code={status.code}
          subreddit={status.subreddit}
          onRetry={() => search(status.subreddit)}
        />
      )}

      {status.phase === "ready" &&
        (status.data.count === 0 ? (
          <NoPostsState subreddit={status.data.subreddit} />
        ) : (
          <>
            <div className="mt-8">
              <SummaryCard
                subreddit={status.data.subreddit}
                aggregate={status.data.sentiment}
              />
              <MethodologyNote />
            </div>
            <DistributionCharts
              posts={status.data.posts}
              aggregate={status.data.sentiment}
            />
            <PostList
              posts={status.data.posts}
              sort={sort}
              onSortChange={setSort}
            />
            <p className="mt-6 text-xs text-ink-faint">
              Data from Reddit via {status.data.source === "oauth" ? "the authenticated API" : "the public JSON endpoint"}.
            </p>
          </>
        ))}
    </div>
  );
}
