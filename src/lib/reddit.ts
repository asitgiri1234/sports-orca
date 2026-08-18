import type {
  ApiError,
  ApiErrorCode,
  RedditPost,
  SubredditPostsResponse,
} from "./types";

export const NAME_PATTERN = /^[A-Za-z0-9_]{2,21}$/;
export const REVALIDATE_SECONDS = 300;
export const POST_LIMIT = 50;
export const FETCH_TIMEOUT_MS = 10_000;
export const FALLBACK_USER_AGENT = "subreddit-vibe-check/1.0";

export const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  INVALID_NAME: 400,
  SUBREDDIT_NOT_FOUND: 404,
  SUBREDDIT_PRIVATE: 403,
  SUBREDDIT_QUARANTINED: 403,
  RATE_LIMITED: 429,
  UPSTREAM_ERROR: 502,
};

export type InterpretResult =
  | { ok: true; data: SubredditPostsResponse }
  | { ok: false; error: ApiError };

export interface RedditResponseInput {
  name: string;
  status: number;
  /** Parsed JSON body, or null when Reddit did not return JSON at all. */
  payload: unknown;
}

function err(code: ApiErrorCode, message: string): InterpretResult {
  return { ok: false, error: { code, message } };
}

export function buildUserAgent(): string {
  const configured = process.env.REDDIT_USER_AGENT?.trim();
  return configured && configured.length > 0 ? configured : FALLBACK_USER_AGENT;
}

export function subredditUrl(name: string): string {
  return `https://www.reddit.com/r/${name}/hot.json?limit=${POST_LIMIT}`;
}

/**
 * Reddit reports a blocked subreddit through a `reason` field, on either a 403
 * or (occasionally) a 200 carrying the same envelope.
 */
function codeForReason(reason: unknown): ApiErrorCode | null {
  switch (reason) {
    case "private":
      return "SUBREDDIT_PRIVATE";
    case "quarantined":
      return "SUBREDDIT_QUARANTINED";
    case "banned":
      return "SUBREDDIT_NOT_FOUND";
    default:
      return null;
  }
}

function readReason(payload: unknown): unknown {
  if (!payload || typeof payload !== "object") return null;
  return (payload as Record<string, unknown>).reason;
}

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function toPost(data: Record<string, unknown>): RedditPost {
  const permalink = asString(data.permalink, "");
  const flair = data.link_flair_text;

  return {
    id: asString(data.id, ""),
    title: asString(data.title, ""),
    author: asString(data.author, "[deleted]"),
    score: asNumber(data.score, 0),
    numComments: asNumber(data.num_comments, 0),
    permalink: permalink ? `https://www.reddit.com${permalink}` : "",
    createdUtc: asNumber(data.created_utc, 0),
    flair: typeof flair === "string" && flair.length > 0 ? flair : null,
  };
}

/**
 * Turn a raw Reddit reply into either clean posts or a typed error. Pure, so
 * the mapping can be exercised without touching the network.
 */
export function interpretRedditResponse({
  name,
  status,
  payload,
}: RedditResponseInput): InterpretResult {
  if (status >= 300 && status < 400) {
    // A missing sub is often a 302 to the subreddit-search page.
    return err("SUBREDDIT_NOT_FOUND", `r/${name} does not exist.`);
  }

  if (status === 429) {
    return err("RATE_LIMITED", "Reddit is rate limiting this app. Try again shortly.");
  }

  if (status === 403 || status === 404) {
    const reasonCode = codeForReason(readReason(payload));
    if (reasonCode) {
      const label =
        reasonCode === "SUBREDDIT_PRIVATE"
          ? "private"
          : reasonCode === "SUBREDDIT_QUARANTINED"
            ? "quarantined"
            : "banned";
      return err(reasonCode, `r/${name} is ${label}.`);
    }

    if (payload === null) {
      // Non-JSON body. Reddit serves an HTML challenge page like this when it
      // blocks the client itself, which says nothing about the subreddit.
      return status === 403
        ? err(
            "UPSTREAM_ERROR",
            "Reddit blocked this request (403 with an HTML page, not a subreddit response). " +
              "It usually means the IP or User-Agent is being refused.",
          )
        : err("SUBREDDIT_NOT_FOUND", `r/${name} does not exist.`);
    }

    return status === 403
      ? err("SUBREDDIT_PRIVATE", `r/${name} is private.`)
      : err("SUBREDDIT_NOT_FOUND", `r/${name} does not exist or has been banned.`);
  }

  if (status < 200 || status >= 300) {
    return err("UPSTREAM_ERROR", `Reddit responded with ${status}.`);
  }

  if (payload === null) {
    return err("UPSTREAM_ERROR", "Reddit returned a non-JSON response.");
  }

  if (!payload || typeof payload !== "object") {
    return err("UPSTREAM_ERROR", "Reddit returned an unexpected response.");
  }

  const envelope = payload as Record<string, unknown>;

  const reasonCode = codeForReason(envelope.reason);
  if (reasonCode) {
    return err(reasonCode, `r/${name} is not publicly readable.`);
  }

  const data =
    envelope.data && typeof envelope.data === "object"
      ? (envelope.data as Record<string, unknown>)
      : null;
  const children = data && Array.isArray(data.children) ? data.children : null;

  if (envelope.kind !== "Listing" || !children) {
    // Not a listing - most likely a search page or error document sent as 200.
    return err("SUBREDDIT_NOT_FOUND", `r/${name} does not exist.`);
  }

  const entries = children.filter(
    (child): child is { kind?: unknown; data?: unknown } =>
      Boolean(child) && typeof child === "object",
  );

  // Search results are t5 (subreddits); posts are t3 (links). Anything non-t3
  // means Reddit answered a different question than the one we asked.
  if (entries.some((child) => child.kind !== "t3")) {
    return err("SUBREDDIT_NOT_FOUND", `r/${name} does not exist.`);
  }

  const posts = entries
    .map((child) => child.data)
    .filter(
      (postData): postData is Record<string, unknown> =>
        Boolean(postData) && typeof postData === "object",
    )
    .map(toPost)
    .filter((post) => post.id !== "");

  return { ok: true, data: { subreddit: name, count: posts.length, posts } };
}
