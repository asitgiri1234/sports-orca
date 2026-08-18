import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  STATUS_BY_CODE,
  TOKEN_URL,
  fetchSubreddit,
  getAccessToken,
  hasOAuthCredentials,
  oauthSubredditUrl,
  resetTokenCache,
  subredditUrl,
} from "./reddit";

function tokenResponse(accessToken: string, expiresIn = 3600) {
  return new Response(
    JSON.stringify({
      access_token: accessToken,
      token_type: "bearer",
      expires_in: expiresIn,
      scope: "*",
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

function listingResponse(status = 200) {
  return new Response(
    JSON.stringify({ kind: "Listing", data: { children: [] } }),
    { status, headers: { "content-type": "application/json" } },
  );
}

/** Records every call so we can assert how many token fetches happened. */
function installFetchMock(
  handler: (url: string, init?: RequestInit) => Response | Promise<Response>,
) {
  const calls: string[] = [];
  const mock = vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    calls.push(url);
    return handler(url, init);
  });
  vi.stubGlobal("fetch", mock);
  return { calls, mock };
}

function tokenCalls(calls: string[]) {
  return calls.filter((url) => url === TOKEN_URL);
}

describe("STATUS_BY_CODE", () => {
  it("separates a failed round trip from an unusable reply", () => {
    // The whole point of splitting these out of UPSTREAM_ERROR.
    expect(STATUS_BY_CODE.NETWORK_ERROR).toBe(504);
    expect(STATUS_BY_CODE.UPSTREAM_ERROR).toBe(502);
    expect(STATUS_BY_CODE.AUTH_ERROR).toBe(502);
  });
});

describe("credential detection", () => {
  beforeEach(() => {
    resetTokenCache();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("requires both id and secret", () => {
    vi.stubEnv("REDDIT_CLIENT_ID", "id");
    vi.stubEnv("REDDIT_CLIENT_SECRET", "");
    expect(hasOAuthCredentials()).toBe(false);

    vi.stubEnv("REDDIT_CLIENT_SECRET", "secret");
    expect(hasOAuthCredentials()).toBe(true);
  });

  it("targets the oauth host only when authenticated", () => {
    expect(oauthSubredditUrl("programming")).toBe(
      "https://oauth.reddit.com/r/programming/hot?limit=50",
    );
    // The anonymous host keeps the .json suffix; the oauth host has none.
    expect(subredditUrl("programming")).toBe(
      "https://www.reddit.com/r/programming/hot.json?limit=50",
    );
  });
});

describe("token caching", () => {
  beforeEach(() => {
    resetTokenCache();
    vi.stubEnv("REDDIT_CLIENT_ID", "test-id");
    vi.stubEnv("REDDIT_CLIENT_SECRET", "test-secret");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("does not fetch a new token per request", async () => {
    const { calls } = installFetchMock(() => tokenResponse("token-1"));

    const first = await getAccessToken();
    const second = await getAccessToken();
    const third = await getAccessToken();

    expect(first.ok && first.token).toBe("token-1");
    expect(second.ok && second.token).toBe("token-1");
    expect(third.ok && third.token).toBe("token-1");
    expect(tokenCalls(calls)).toHaveLength(1);
  });

  it("sends Basic auth and the client_credentials grant", async () => {
    let seenInit: RequestInit | undefined;
    installFetchMock((_url, init) => {
      seenInit = init;
      return tokenResponse("token-1");
    });

    await getAccessToken();

    const headers = seenInit?.headers as Record<string, string>;
    expect(seenInit?.method).toBe("POST");
    expect(headers.Authorization).toBe(
      `Basic ${Buffer.from("test-id:test-secret").toString("base64")}`,
    );
    expect(headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    expect(headers["User-Agent"]).toBeTruthy();
    expect(String(seenInit?.body)).toBe("grant_type=client_credentials");
  });

  it("refreshes when the cached token is within 60s of expiring", async () => {
    let issued = 0;
    const { calls } = installFetchMock(() => {
      issued += 1;
      // Expires in 30s, i.e. already inside the 60s refresh margin.
      return tokenResponse(`token-${issued}`, 30);
    });

    const first = await getAccessToken();
    const second = await getAccessToken();

    expect(first.ok && first.token).toBe("token-1");
    expect(second.ok && second.token).toBe("token-2");
    expect(tokenCalls(calls)).toHaveLength(2);
  });

  it("collapses concurrent misses into a single token request", async () => {
    const { calls } = installFetchMock(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return tokenResponse("token-1");
    });

    const results = await Promise.all([
      getAccessToken(),
      getAccessToken(),
      getAccessToken(),
    ]);

    expect(results.every((r) => r.ok)).toBe(true);
    expect(tokenCalls(calls)).toHaveLength(1);
  });

  it("reports a token failure distinctly from a listing failure", async () => {
    installFetchMock(
      () =>
        new Response(JSON.stringify({ message: "Unauthorized", error: 401 }), {
          status: 401,
        }),
    );

    const result = await getAccessToken();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("status");
      expect(result.status).toBe(401);
    }
  });
});

describe("fetchSubreddit", () => {
  beforeEach(() => {
    resetTokenCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("falls back to the anonymous host with no credentials", async () => {
    vi.stubEnv("REDDIT_CLIENT_ID", "");
    vi.stubEnv("REDDIT_CLIENT_SECRET", "");
    const { calls } = installFetchMock(() => listingResponse());

    const outcome = await fetchSubreddit("programming");

    expect(outcome.kind).toBe("responded");
    expect(outcome.mode).toBe("anonymous");
    expect(calls).toEqual([subredditUrl("programming")]);
    expect(tokenCalls(calls)).toHaveLength(0);
  });

  it("uses the oauth host with a bearer token when credentials exist", async () => {
    vi.stubEnv("REDDIT_CLIENT_ID", "test-id");
    vi.stubEnv("REDDIT_CLIENT_SECRET", "test-secret");

    let listingAuth: string | undefined;
    const { calls } = installFetchMock((url, init) => {
      if (url === TOKEN_URL) return tokenResponse("token-1");
      listingAuth = (init?.headers as Record<string, string>)?.Authorization;
      return listingResponse();
    });

    const outcome = await fetchSubreddit("programming");

    expect(outcome.kind).toBe("responded");
    expect(outcome.mode).toBe("oauth");
    expect(listingAuth).toBe("bearer token-1");
    expect(calls).toContain(oauthSubredditUrl("programming"));
  });

  it("invalidates the token and retries exactly once on a 401", async () => {
    vi.stubEnv("REDDIT_CLIENT_ID", "test-id");
    vi.stubEnv("REDDIT_CLIENT_SECRET", "test-secret");

    let issued = 0;
    let listingAttempts = 0;
    const { calls } = installFetchMock((url) => {
      if (url === TOKEN_URL) {
        issued += 1;
        return tokenResponse(`token-${issued}`);
      }
      listingAttempts += 1;
      // First listing call is rejected, the retry succeeds.
      return listingResponse(listingAttempts === 1 ? 401 : 200);
    });

    const outcome = await fetchSubreddit("programming");

    expect(outcome.kind).toBe("responded");
    if (outcome.kind === "responded") expect(outcome.status).toBe(200);
    expect(listingAttempts).toBe(2);
    expect(tokenCalls(calls)).toHaveLength(2);
  });

  it("gives up with an auth error when the retry also 401s", async () => {
    vi.stubEnv("REDDIT_CLIENT_ID", "test-id");
    vi.stubEnv("REDDIT_CLIENT_SECRET", "test-secret");

    let listingAttempts = 0;
    installFetchMock((url) => {
      if (url === TOKEN_URL) return tokenResponse("token-1");
      listingAttempts += 1;
      return listingResponse(401);
    });

    const outcome = await fetchSubreddit("programming");

    expect(outcome.kind).toBe("auth-error");
    // Exactly one retry, not a loop.
    expect(listingAttempts).toBe(2);
  });

  it("distinguishes a thrown fetch as a network error", async () => {
    vi.stubEnv("REDDIT_CLIENT_ID", "");
    vi.stubEnv("REDDIT_CLIENT_SECRET", "");
    installFetchMock(() => {
      throw Object.assign(new Error("getaddrinfo ENOTFOUND"), {
        code: "ENOTFOUND",
      });
    });

    const outcome = await fetchSubreddit("programming");

    expect(outcome.kind).toBe("network-error");
    if (outcome.kind === "network-error") {
      expect(outcome.message).toContain("ENOTFOUND");
    }
  });
});
