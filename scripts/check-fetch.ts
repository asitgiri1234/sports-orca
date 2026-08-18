/**
 * Smoke-test the subreddit route.
 *
 *   npm run dev            # in one terminal
 *   npm run check:fetch    # in another
 *
 * Part 1 hits the live route. Part 2 replays recorded Reddit payload shapes
 * through the pure mapper, so the error matrix stays verifiable even when the
 * network blocks Reddit (it 403s unauthenticated JSON from many IPs).
 *
 * Override the target with BASE_URL=https://... if the app runs elsewhere.
 */
import { interpretRedditResponse } from "../src/lib/reddit";
import { attachSentiment } from "../src/lib/sentiment";
import {
  isApiError,
  type ApiErrorCode,
  type SubredditApiResult,
} from "../src/lib/types";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

const LIVE_CASES: Array<{ name: string; expectation: string }> = [
  { name: "programming", expectation: "public sub -> 200 with posts" },
  { name: "thisdoesnotexistabc123", expectation: "22 chars, so 400 INVALID_NAME" },
  { name: "thisdoesnotexist123", expectation: "missing sub -> 404" },
  { name: "CenturyClub", expectation: "private sub -> 403" },
];

function line(char = "-") {
  console.log(char.repeat(70));
}

async function checkLive(name: string, expectation: string) {
  const url = `${BASE_URL}/api/subreddit/${name}`;
  line();
  console.log(`r/${name}`);
  console.log(`  expecting: ${expectation}`);

  let response: Response;
  try {
    response = await fetch(url);
  } catch (error) {
    console.log(`  FAILED: ${(error as Error).message}`);
    console.log(`  Is the dev server running at ${BASE_URL}?`);
    return;
  }

  console.log(`  status: ${response.status} ${response.statusText}`);

  const text = await response.text();
  let body: SubredditApiResult;
  try {
    body = JSON.parse(text) as SubredditApiResult;
  } catch {
    console.log(`  non-JSON body: ${text.slice(0, 200)}`);
    return;
  }

  if (isApiError(body)) {
    console.log(`  code: ${body.code}`);
    console.log(`  message: ${body.message}`);
    return;
  }

  console.log(`  count: ${body.count}`);
  for (const post of body.posts.slice(0, 3)) {
    console.log(`    [${post.score}pts ${post.numComments}c] ${post.title.slice(0, 55)}`);
    console.log(
      `        by u/${post.author} | flair: ${post.flair ?? "none"} | ${new Date(
        post.createdUtc * 1000,
      ).toISOString()}`,
    );
    console.log(`        ${post.permalink}`);
  }
  if (body.count > 3) console.log(`    ... and ${body.count - 3} more`);
}

/** A realistic t3 child, trimmed to the fields the mapper reads. */
function postChild(id: string, overrides: Record<string, unknown> = {}) {
  return {
    kind: "t3",
    data: {
      id,
      title: `Post ${id}`,
      author: `user_${id}`,
      score: 1234,
      num_comments: 56,
      permalink: `/r/programming/comments/${id}/post_${id}/`,
      created_utc: 1_710_000_000,
      link_flair_text: "Discussion",
      ...overrides,
    },
  };
}

type Fixture = {
  label: string;
  status: number;
  payload: unknown;
  expect: ApiErrorCode | "OK";
};

const FIXTURES: Fixture[] = [
  {
    label: "200 real listing (two posts)",
    status: 200,
    payload: {
      kind: "Listing",
      data: { children: [postChild("abc123"), postChild("def456")] },
    },
    expect: "OK",
  },
  {
    label: "200 listing with zero posts (empty but real sub)",
    status: 200,
    payload: { kind: "Listing", data: { children: [] } },
    expect: "OK",
  },
  {
    label: "200 search-results page (t5 children, not t3)",
    status: 200,
    payload: {
      kind: "Listing",
      data: { children: [{ kind: "t5", data: { display_name: "programming" } }] },
    },
    expect: "SUBREDDIT_NOT_FOUND",
  },
  {
    label: "200 but not a Listing envelope at all",
    status: 200,
    payload: { error: "something else" },
    expect: "SUBREDDIT_NOT_FOUND",
  },
  {
    label: "200 carrying a private reason",
    status: 200,
    payload: { reason: "private", message: "Forbidden" },
    expect: "SUBREDDIT_PRIVATE",
  },
  {
    label: "302 redirect to the search page",
    status: 302,
    payload: null,
    expect: "SUBREDDIT_NOT_FOUND",
  },
  {
    label: "403 private subreddit (JSON reason)",
    status: 403,
    payload: { reason: "private", message: "Forbidden", error: 403 },
    expect: "SUBREDDIT_PRIVATE",
  },
  {
    label: "403 quarantined subreddit (JSON reason)",
    status: 403,
    payload: { reason: "quarantined", message: "Forbidden", error: 403 },
    expect: "SUBREDDIT_QUARANTINED",
  },
  {
    label: "403 HTML anti-bot page (no JSON) -> upstream, NOT private",
    status: 403,
    payload: null,
    expect: "UPSTREAM_ERROR",
  },
  {
    label: "404 banned subreddit",
    status: 404,
    payload: { reason: "banned", message: "Not Found", error: 404 },
    expect: "SUBREDDIT_NOT_FOUND",
  },
  {
    label: "404 plain",
    status: 404,
    payload: { message: "Not Found", error: 404 },
    expect: "SUBREDDIT_NOT_FOUND",
  },
  { label: "429 rate limited", status: 429, payload: null, expect: "RATE_LIMITED" },
  { label: "500 from Reddit", status: 500, payload: null, expect: "UPSTREAM_ERROR" },
  {
    label: "200 with a non-JSON body",
    status: 200,
    payload: null,
    expect: "UPSTREAM_ERROR",
  },
];

function runFixtures(): boolean {
  let failures = 0;

  for (const fixture of FIXTURES) {
    const result = interpretRedditResponse({
      name: "programming",
      status: fixture.status,
      payload: fixture.payload,
    });
    const actual: ApiErrorCode | "OK" = result.ok ? "OK" : result.error.code;
    const pass = actual === fixture.expect;
    if (!pass) failures += 1;

    console.log(`  ${pass ? "PASS" : "FAIL"}  ${fixture.label}`);
    if (!pass) {
      console.log(`        expected ${fixture.expect}, got ${actual}`);
    } else if (result.ok) {
      console.log(`        -> ${result.data.count} post(s) mapped`);
    }
  }

  return failures === 0;
}

/** Compose the full API body offline, exactly as the route does. */
function showApiBody() {
  const result = interpretRedditResponse({
    name: "programming",
    status: 200,
    payload: {
      kind: "Listing",
      data: {
        children: [
          postChild("abc123", {
            title: "This library is absolutely fantastic and I love the docs",
          }),
          postChild("def456", {
            title: "Terrible release, this update is a buggy disaster and I hate it",
          }),
          postChild("ghi789", { title: "Rust 1.75 released" }),
          postChild("jkl012", { title: "not good at all" }),
        ],
      },
    },
  });
  if (!result.ok) {
    console.log(`  unexpected error: ${result.error.code}`);
    return;
  }

  const body = attachSentiment(result.data);
  console.log("First post with sentiment attached:");
  console.log(JSON.stringify(body.posts[0], null, 2));
  console.log("");
  console.log("Aggregate block:");
  console.log(
    JSON.stringify(
      {
        ...body.sentiment,
        mostPositive: body.sentiment.mostPositive?.title ?? null,
        mostNegative: body.sentiment.mostNegative?.title ?? null,
      },
      null,
      2,
    ),
  );
}

async function main() {
  console.log(`PART 1 - live route at ${BASE_URL}`);
  console.log(
    `REDDIT_USER_AGENT is ${process.env.REDDIT_USER_AGENT ? "set" : "unset (server uses its fallback)"}`,
  );
  for (const testCase of LIVE_CASES) {
    await checkLive(testCase.name, testCase.expectation);
  }

  line("=");
  console.log("PART 2 - recorded Reddit payload shapes through the mapper");
  const ok = runFixtures();

  line("=");
  console.log("PART 3 - full API body (mapper + sentiment, composed offline)");
  showApiBody();

  line("=");
  console.log(ok ? "All fixtures passed." : "Some fixtures FAILED.");
  if (!ok) process.exitCode = 1;
}

void main();
