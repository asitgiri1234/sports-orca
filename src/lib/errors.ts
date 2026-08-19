import type { ApiErrorCode } from "./types";

export interface ErrorCopy {
  /** Short headline - what happened, in the user's terms. */
  title: string;
  /** What it means and what to do about it. */
  body: string;
  /** True when retrying the same query might plausibly work. */
  retryable: boolean;
}

/**
 * Every failure gets its own wording. A private community and a typo are
 * different situations and must not read as the same dead end: one is a
 * spelling problem the user can fix, the other is a permission wall they
 * cannot. The Record type makes this exhaustive - adding a code to
 * ApiErrorCode will not compile until it has copy here.
 */
export const ERROR_COPY: Record<ApiErrorCode, ErrorCopy> = {
  INVALID_NAME: {
    title: "That is not a valid subreddit name",
    body: "Names are 2 to 21 characters and may only contain letters, numbers, and underscores. Check for spaces, slashes, or punctuation.",
    retryable: false,
  },
  SUBREDDIT_NOT_FOUND: {
    title: "No subreddit with that name",
    body: "Nothing on Reddit matches it. It may be spelled differently, or the community may have been banned.",
    retryable: false,
  },
  SUBREDDIT_PRIVATE: {
    title: "This community is private",
    body: "The subreddit exists, but only approved members can read it, so there are no posts to score. This is not a spelling mistake.",
    retryable: false,
  },
  SUBREDDIT_QUARANTINED: {
    title: "This community is quarantined",
    body: "Reddit has placed it behind an opt-in warning. Its posts are not served through the public API, so they cannot be scored here.",
    retryable: false,
  },
  RATE_LIMITED: {
    title: "Reddit is rate limiting this app",
    body: "Too many requests went out in a short window. Wait about a minute, then try again.",
    retryable: true,
  },
  AUTH_ERROR: {
    title: "Reddit rejected our credentials",
    body: "The app could not obtain a usable access token. Check that REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET in .env.local are correct.",
    retryable: false,
  },
  UPSTREAM_ERROR: {
    title: "Reddit returned something unusable",
    body: "Usually an IP-level block rather than a problem with this subreddit - Reddit answers with an HTML page instead of data. Configuring OAuth credentials is the usual fix.",
    retryable: true,
  },
  NETWORK_ERROR: {
    title: "Could not reach Reddit",
    body: "The request never completed - a DNS, TLS, or timeout problem. Check your connection and try again.",
    retryable: true,
  },
};

const UNKNOWN: ErrorCopy = {
  title: "Something went wrong",
  body: "The request failed in a way this app does not recognise. Try again in a moment.",
  retryable: true,
};

export function copyForCode(code: string | undefined): ErrorCopy {
  if (code && code in ERROR_COPY) {
    return ERROR_COPY[code as ApiErrorCode];
  }
  return UNKNOWN;
}
