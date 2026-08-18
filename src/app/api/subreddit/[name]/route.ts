import { NextResponse } from "next/server";

import {
  NAME_PATTERN,
  STATUS_BY_CODE,
  fetchSubreddit,
  interpretRedditResponse,
} from "@/lib/reddit";
import { attachSentiment } from "@/lib/sentiment";
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

  const outcome = await fetchSubreddit(name);

  // The request never completed - DNS, TLS, connection reset, or timeout.
  if (outcome.kind === "network-error") {
    return fail({
      code: "NETWORK_ERROR",
      message: `Could not reach Reddit: ${outcome.message}`,
    });
  }

  // We could not obtain or use an OAuth token.
  if (outcome.kind === "auth-error") {
    return fail({ code: "AUTH_ERROR", message: outcome.message });
  }

  const result = interpretRedditResponse({
    name,
    status: outcome.status,
    payload: outcome.payload,
  });

  if (!result.ok) return fail(result.error);

  return NextResponse.json(attachSentiment(result.data, outcome.mode));
}
