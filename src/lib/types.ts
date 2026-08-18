/** A single hot post, flattened out of Reddit's nested listing envelope. */
export interface RedditPost {
  id: string;
  title: string;
  author: string;
  score: number;
  numComments: number;
  /** Absolute URL, e.g. https://www.reddit.com/r/programming/comments/abc123/... */
  permalink: string;
  /** Seconds since the Unix epoch, as Reddit reports it. */
  createdUtc: number;
  /** Link flair text, or null when the post has none. */
  flair: string | null;
}

export interface SubredditPostsResponse {
  subreddit: string;
  count: number;
  posts: RedditPost[];
}

/**
 * Machine-readable failure codes. Each maps to exactly one HTTP status:
 *   INVALID_NAME           400  name failed the format check, never left the server
 *   SUBREDDIT_NOT_FOUND    404  no such subreddit, or it is banned
 *   SUBREDDIT_PRIVATE      403  exists but requires approval to view
 *   SUBREDDIT_QUARANTINED  403  exists but is gated behind a quarantine opt-in
 *   RATE_LIMITED           429  Reddit throttled us
 *   UPSTREAM_ERROR         502  Reddit erred, timed out, or answered with garbage
 */
export type ApiErrorCode =
  | "INVALID_NAME"
  | "SUBREDDIT_NOT_FOUND"
  | "SUBREDDIT_PRIVATE"
  | "SUBREDDIT_QUARANTINED"
  | "RATE_LIMITED"
  | "UPSTREAM_ERROR";

export interface ApiError {
  code: ApiErrorCode;
  message: string;
}

/** What the route returns: posts on success, an ApiError otherwise. */
export type SubredditApiResult = SubredditPostsResponse | ApiError;

export function isApiError(result: SubredditApiResult): result is ApiError {
  return "code" in result;
}
