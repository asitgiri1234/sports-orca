import type {
  ApiError,
  ApiErrorCode,
  AuthMode,
  RedditPost,
  SubredditPosts,
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
  AUTH_ERROR: 502,
  UPSTREAM_ERROR: 502,
  NETWORK_ERROR: 504,
};

export const TOKEN_URL = "https://www.reddit.com/api/v1/access_token";

/** Refresh a token once it is within this window of expiring. */
export const TOKEN_REFRESH_MARGIN_MS = 60_000;

export type InterpretResult =
  | { ok: true; data: SubredditPosts }
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


// ---------------------------------------------------------------------------
// OAuth: app-only (client_credentials) tokens
// ---------------------------------------------------------------------------

export function oauthSubredditUrl(name: string): string {
  // The oauth host serves the same payload shape without the .json suffix.
  return `https://oauth.reddit.com/r/${name}/hot?limit=${POST_LIMIT}`;
}

export function hasOAuthCredentials(): boolean {
  return (
    (process.env.REDDIT_CLIENT_ID?.trim().length ?? 0) > 0 &&
    (process.env.REDDIT_CLIENT_SECRET?.trim().length ?? 0) > 0
  );
}

export type TokenResult =
  | { ok: true; token: string; expiresIn: number }
  | {
      ok: false;
      reason: "no-credentials" | "network" | "status" | "malformed";
      message: string;
      status?: number;
    };

interface CachedToken {
  token: string;
  /** Epoch ms at which Reddit says this token stops working. */
  expiresAt: number;
}

/**
 * Module-scope cache. One token is reused across requests for its full
 * lifetime; `inFlight` collapses concurrent misses into a single token call so
 * a burst of requests does not trigger a burst of token fetches.
 */
let cachedToken: CachedToken | null = null;
let inFlight: Promise<TokenResult> | null = null;

/** Exposed for tests and the check script. */
export function resetTokenCache(): void {
  cachedToken = null;
  inFlight = null;
}

export function getCachedTokenExpiry(): number | null {
  return cachedToken?.expiresAt ?? null;
}

function tokenIsFresh(entry: CachedToken | null): entry is CachedToken {
  return entry !== null && Date.now() < entry.expiresAt - TOKEN_REFRESH_MARGIN_MS;
}

/**
 * Ask Reddit for an app-only token. Always hits the network - callers wanting
 * the cache should use getAccessToken.
 */
export async function requestAccessToken(): Promise<TokenResult> {
  const id = process.env.REDDIT_CLIENT_ID?.trim();
  const secret = process.env.REDDIT_CLIENT_SECRET?.trim();

  if (!id || !secret) {
    return {
      ok: false,
      reason: "no-credentials",
      message: "REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET are not both set.",
    };
  }

  const basic = Buffer.from(`${id}:${secret}`).toString("base64");

  let response: Response;
  try {
    response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": buildUserAgent(),
      },
      body: new URLSearchParams({ grant_type: "client_credentials" }).toString(),
      // The token is cached in module scope, so never cache the request itself.
      cache: "no-store",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (error) {
    return {
      ok: false,
      reason: "network",
      message: `Token request never completed: ${(error as Error).message}`,
    };
  }

  const bodyText = await response.text().catch(() => "");

  if (!response.ok) {
    return {
      ok: false,
      reason: "status",
      status: response.status,
      message: `Token endpoint returned ${response.status}: ${bodyText.slice(0, 200)}`,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    return {
      ok: false,
      reason: "malformed",
      status: response.status,
      message: "Token endpoint returned a non-JSON body.",
    };
  }

  const payload = parsed as Record<string, unknown>;
  const token = typeof payload.access_token === "string" ? payload.access_token : null;
  const expiresIn =
    typeof payload.expires_in === "number" && Number.isFinite(payload.expires_in)
      ? payload.expires_in
      : 3600;

  if (!token) {
    return {
      ok: false,
      reason: "malformed",
      status: response.status,
      message: "Token endpoint response had no access_token.",
    };
  }

  return { ok: true, token, expiresIn };
}

/** Cached token accessor. Refreshes only when missing, stale, or forced. */
export async function getAccessToken(forceRefresh = false): Promise<TokenResult> {
  if (forceRefresh) cachedToken = null;

  if (tokenIsFresh(cachedToken)) {
    return { ok: true, token: cachedToken.token, expiresIn: 0 };
  }

  if (inFlight) return inFlight;

  inFlight = (async () => {
    const result = await requestAccessToken();
    if (result.ok) {
      cachedToken = {
        token: result.token,
        expiresAt: Date.now() + result.expiresIn * 1000,
      };
    }
    return result;
  })();

  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}

// ---------------------------------------------------------------------------
// Fetching a listing
// ---------------------------------------------------------------------------

export type SubredditFetch =
  | { kind: "responded"; mode: AuthMode; status: number; payload: unknown }
  | { kind: "network-error"; mode: AuthMode; message: string }
  | { kind: "auth-error"; mode: AuthMode; message: string };

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    // Reddit serves HTML block/challenge pages; interpretRedditResponse reads
    // a null payload as "not JSON".
    return null;
  }
}

type RawFetch =
  | { ok: true; status: number; text: string }
  | { ok: false; message: string };

async function rawFetch(
  url: string,
  headers: Record<string, string>,
): Promise<RawFetch> {
  try {
    const response = await fetch(url, {
      headers,
      // A missing sub is often a 302 to the search page; staying manual keeps
      // that visible instead of silently following it to a 200.
      redirect: "manual",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      next: { revalidate: REVALIDATE_SECONDS },
    });
    return {
      ok: true,
      status: response.status,
      text: await response.text().catch(() => ""),
    };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}

async function fetchAnonymous(name: string): Promise<SubredditFetch> {
  const result = await rawFetch(subredditUrl(name), {
    // Reddit hard-blocks generic/absent User-Agents, so this is load-bearing.
    "User-Agent": buildUserAgent(),
    Accept: "application/json",
  });

  if (!result.ok) {
    return { kind: "network-error", mode: "anonymous", message: result.message };
  }

  return {
    kind: "responded",
    mode: "anonymous",
    status: result.status,
    payload: parseJson(result.text),
  };
}

async function fetchWithOAuth(name: string): Promise<SubredditFetch> {
  const url = oauthSubredditUrl(name);

  const attempt = (token: string) =>
    rawFetch(url, {
      Authorization: `bearer ${token}`,
      "User-Agent": buildUserAgent(),
      Accept: "application/json",
    });

  let tokenResult = await getAccessToken();
  if (!tokenResult.ok) {
    return { kind: "auth-error", mode: "oauth", message: tokenResult.message };
  }

  let result = await attempt(tokenResult.token);
  if (!result.ok) {
    return { kind: "network-error", mode: "oauth", message: result.message };
  }

  // A 401 means the cached token is dead (revoked, or expired early). Drop it
  // and retry exactly once with a fresh one.
  if (result.status === 401) {
    tokenResult = await getAccessToken(true);
    if (!tokenResult.ok) {
      return { kind: "auth-error", mode: "oauth", message: tokenResult.message };
    }

    result = await attempt(tokenResult.token);
    if (!result.ok) {
      return { kind: "network-error", mode: "oauth", message: result.message };
    }

    if (result.status === 401) {
      return {
        kind: "auth-error",
        mode: "oauth",
        message: "Reddit rejected a freshly issued token (401 after retry).",
      };
    }
  }

  return {
    kind: "responded",
    mode: "oauth",
    status: result.status,
    payload: parseJson(result.text),
  };
}

/**
 * Fetch a subreddit listing, preferring OAuth and falling back to the
 * unauthenticated host when no credentials are configured, so the project
 * still runs for anyone without an app registered.
 */
export async function fetchSubreddit(name: string): Promise<SubredditFetch> {
  return hasOAuthCredentials() ? fetchWithOAuth(name) : fetchAnonymous(name);
}
