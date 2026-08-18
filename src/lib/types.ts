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

/** Post sentiment classes, using VADER's standard compound thresholds. */
export type SentimentLabel = "positive" | "negative" | "neutral";

/**
 * How much one token moved the compound score, measured by re-scoring the
 * title without it. Signed: negative means the token pushed the score down.
 */
export interface TokenContribution {
  token: string;
  contribution: number;
}

export interface SentimentResult {
  /** Normalized compound score in [-1, 1]. */
  compound: number;
  label: SentimentLabel;
  /** The three most influential tokens, strongest first. */
  topTokens: TokenContribution[];
}

export type ScoredPost = RedditPost & { sentiment: SentimentResult };

export interface LabelBreakdown {
  count: number;
  /** Share of all scored posts, 0-100, rounded to one decimal. */
  percentage: number;
}

export interface SentimentAggregate {
  count: number;
  meanCompound: number;
  breakdown: Record<SentimentLabel, LabelBreakdown>;
  mostPositive: ScoredPost | null;
  mostNegative: ScoredPost | null;
}

/** Posts as parsed from Reddit, before sentiment is attached. */
export interface SubredditPosts {
  subreddit: string;
  count: number;
  posts: RedditPost[];
}

/** What the API route returns on success. */
export interface SubredditPostsResponse {
  subreddit: string;
  count: number;
  posts: ScoredPost[];
  sentiment: SentimentAggregate;
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
