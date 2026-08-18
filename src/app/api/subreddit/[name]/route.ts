import { NextResponse } from "next/server";

import {
  FETCH_TIMEOUT_MS,
  NAME_PATTERN,
  REVALIDATE_SECONDS,
  STATUS_BY_CODE,
  buildUserAgent,
  interpretRedditResponse,
  subredditUrl,
} from "@/lib/reddit";
import type { ApiError } from "@/lib/types";

/** Cache a given subreddit's hot listing for 5 minutes. */
export const revalidate = 300;

function fail(error: ApiError) {
  return NextResponse.json(error, { status: STATUS_BY_CODE[error.code] });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;

  if (!NAME_PATTERN.test(name)) {
    return fail({
      code: "INVALID_NAME",
      message:
        "Subreddit names must be 2-21 characters of letters, numbers, or underscores.",
    });
  }

  let response: Response;
  try {
    response = await fetch(subredditUrl(name), {
      headers: {
        // Reddit hard-blocks generic/absent User-Agents, so this is load-bearing.
        "User-Agent": buildUserAgent(),
        Accept: "application/json",
      },
      // A nonexistent sub is often a 302 to the subreddit-search page. Staying
      // manual keeps that visible instead of silently following it to a 200.
      redirect: "manual",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      next: { revalidate: REVALIDATE_SECONDS },
    });
  } catch {
    return fail({ code: "UPSTREAM_ERROR", message: "Could not reach Reddit." });
  }

  // Parse defensively: Reddit serves HTML challenge/error pages on some
  // failures, and interpretRedditResponse treats a null payload as "not JSON".
  const payload = await response
    .json()
    .then((value: unknown) => value)
    .catch(() => null);

  const result = interpretRedditResponse({
    name,
    status: response.status,
    payload,
  });

  return result.ok ? NextResponse.json(result.data) : fail(result.error);
}
