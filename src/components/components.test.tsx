import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PostList, type SortMode } from "./PostList";
import { SummaryCard } from "./SummaryCard";
import { ErrorPanel } from "./StateViews";
import { attachSentiment } from "@/lib/sentiment";
import type { RedditPost } from "@/lib/types";

function post(id: string, title: string, overrides: Partial<RedditPost> = {}): RedditPost {
  return {
    id,
    title,
    author: `user_${id}`,
    score: 12_345,
    numComments: 678,
    permalink: `https://www.reddit.com/r/programming/comments/${id}/`,
    createdUtc: Math.floor(Date.now() / 1000) - 7200,
    flair: null,
    ...overrides,
  };
}

const RAW = [
  post("p1", "This library is absolutely fantastic and I love the docs"),
  post("p2", "Terrible release, this update is a buggy disaster and I hate it"),
  post("p3", "Rust 1.75 released"),
];

const body = attachSentiment(
  { subreddit: "programming", count: RAW.length, posts: RAW },
  "oauth",
);

function renderList(sort: SortMode) {
  return renderToStaticMarkup(
    <PostList posts={body.posts} sort={sort} onSortChange={() => {}} />,
  );
}

/** Pull post titles out in DOM order, so we can assert on sorting. */
function titleOrder(html: string): string[] {
  return [...html.matchAll(/rel="noopener noreferrer"[^>]*>([^<]+)</g)].map(
    (match) => match[1],
  );
}

describe("PostList", () => {
  it("renders every post with an external link that is safe to open", () => {
    const html = renderList("hot");

    for (const scored of body.posts) {
      expect(html).toContain(scored.title);
      expect(html).toContain(scored.permalink);
    }

    const links = [...html.matchAll(/<a\s[^>]*href="https:\/\/www\.reddit\.com[^"]*"[^>]*>/g)];
    expect(links).toHaveLength(RAW.length);
    for (const [tag] of links) {
      expect(tag).toContain('target="_blank"');
      expect(tag).toContain('rel="noopener noreferrer"');
    }
  });

  it("shows a label, score, upvotes and comment count on each row", () => {
    const html = renderList("hot");

    expect(html).toContain("Positive");
    expect(html).toContain("Negative");
    expect(html).toContain("Neutral");
    expect(html).toContain("upvotes");
    expect(html).toContain("comments");
    // 12,345 upvotes should be compacted rather than wrapping the meta row.
    expect(html).toContain("12k");
  });

  it("leaves hot order untouched by default", () => {
    expect(titleOrder(renderList("hot"))).toEqual(RAW.map((p) => p.title));
  });

  it("sorts most positive and most negative first", () => {
    const positiveFirst = titleOrder(renderList("positive"));
    const negativeFirst = titleOrder(renderList("negative"));

    expect(positiveFirst[0]).toBe(RAW[0].title);
    expect(negativeFirst[0]).toBe(RAW[1].title);
    // Same set of posts, just reordered.
    expect([...positiveFirst].sort()).toEqual([...negativeFirst].sort());
  });
});

describe("SummaryCard", () => {
  it("shows a signed mean score, a one-word verdict and the breakdown", () => {
    const html = renderToStaticMarkup(
      <SummaryCard subreddit="programming" aggregate={body.sentiment} />,
    );

    expect(html).toMatch(/[+-]\d\.\d\d/);
    expect(html).toMatch(/Glowing|Positive|Neutral|Negative|Hostile/);
    expect(html).toContain("33.3%");
    expect(html).toContain("Most positive");
    expect(html).toContain("Most negative");
  });
});

describe("ErrorPanel", () => {
  it("gives a private subreddit different wording than a typo", () => {
    const privateHtml = renderToStaticMarkup(
      <ErrorPanel code="SUBREDDIT_PRIVATE" subreddit="CenturyClub" onRetry={() => {}} />,
    );
    const missingHtml = renderToStaticMarkup(
      <ErrorPanel code="SUBREDDIT_NOT_FOUND" subreddit="typoo" onRetry={() => {}} />,
    );

    expect(privateHtml).toContain("private");
    expect(missingHtml).toContain("No subreddit with that name");
    expect(privateHtml).not.toContain("No subreddit with that name");
  });

  it("offers a retry only when retrying could plausibly help", () => {
    const rateLimited = renderToStaticMarkup(
      <ErrorPanel code="RATE_LIMITED" subreddit="programming" onRetry={() => {}} />,
    );
    const invalid = renderToStaticMarkup(
      <ErrorPanel code="INVALID_NAME" subreddit="bad name" onRetry={() => {}} />,
    );

    expect(rateLimited).toContain("Try again");
    expect(invalid).not.toContain("Try again");
  });

  it("falls back to generic copy for an unrecognised code", () => {
    const html = renderToStaticMarkup(
      <ErrorPanel code="SOMETHING_NEW" subreddit="programming" onRetry={() => {}} />,
    );
    expect(html).toContain("Something went wrong");
  });
});
