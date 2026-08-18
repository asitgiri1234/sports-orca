import { SentimentIntensityAnalyzer } from "vader-sentiment";

import type {
  AuthMode,
  ScoredPost,
  SubredditPosts,
  SubredditPostsResponse,
  SentimentAggregate,
  SentimentLabel,
  SentimentResult,
  TokenContribution,
} from "./types";

/** VADER's standard thresholds (see the vaderSentiment README). */
export const POSITIVE_THRESHOLD = 0.05;
export const NEGATIVE_THRESHOLD = -0.05;

/** How many contributing tokens to report per title. */
export const TOP_TOKEN_COUNT = 3;

/**
 * Ceiling on tokens we run ablation over. Scoring is O(tokens) analyzer calls,
 * and Reddit titles cap out around 300 characters, so this only guards against
 * pathological input.
 */
const MAX_ABLATION_TOKENS = 100;

function round(value: number, places = 4): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

export function labelFor(compound: number): SentimentLabel {
  if (compound >= POSITIVE_THRESHOLD) return "positive";
  if (compound <= NEGATIVE_THRESHOLD) return "negative";
  return "neutral";
}

function compoundOf(text: string): number {
  if (text.trim().length === 0) return 0;
  return SentimentIntensityAnalyzer.polarity_scores(text).compound;
}

function tokenize(text: string): string[] {
  return text.split(/\s+/).filter((token) => token.length > 0);
}

/** Trim surrounding punctuation but keep case - VADER treats ALL CAPS as emphasis. */
function displayToken(token: string): string {
  const cleaned = token.replace(/^[^\p{L}\p{N}'!?]+|[^\p{L}\p{N}'!?]+$/gu, "");
  return cleaned.length > 0 ? cleaned : token;
}

/**
 * Attribute the compound score to individual tokens by leave-one-out ablation:
 * re-score the title with each token removed and take the difference.
 *
 * This is deliberately not a raw lexicon lookup. VADER's score depends on
 * context - negators flip the words after them, boosters amplify them - so
 * ablation captures what a token actually did in this sentence. In "not good
 * at all", it correctly credits the swing to "not" rather than reading "good"
 * as positive.
 */
function tokenContributions(title: string, compound: number): TokenContribution[] {
  const tokens = tokenize(title);
  if (tokens.length === 0 || tokens.length > MAX_ABLATION_TOKENS) return [];

  const contributions: TokenContribution[] = tokens.map((token, index) => {
    const without = tokens.filter((_, other) => other !== index).join(" ");
    return {
      token: displayToken(token),
      contribution: round(compound - compoundOf(without)),
    };
  });

  return contributions
    .filter((entry) => entry.contribution !== 0)
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
    .slice(0, TOP_TOKEN_COUNT);
}

/**
 * Score a single post title. Returns the compound score, its label, and the
 * tokens that moved it most, so a result can be inspected rather than trusted.
 */
export function scoreTitle(title: string): SentimentResult {
  const text = typeof title === "string" ? title : "";
  const compound = round(compoundOf(text));

  return {
    compound,
    label: labelFor(compound),
    topTokens: tokenContributions(text, compound),
  };
}

const EMPTY_BREAKDOWN: Record<SentimentLabel, { count: number; percentage: number }> = {
  positive: { count: 0, percentage: 0 },
  negative: { count: 0, percentage: 0 },
  neutral: { count: 0, percentage: 0 },
};

/**
 * Roll scored posts up into headline stats: the mean compound score, the
 * label split, and the extremes at either end.
 */
export function aggregateSentiment(posts: ScoredPost[]): SentimentAggregate {
  if (posts.length === 0) {
    return {
      count: 0,
      meanCompound: 0,
      breakdown: {
        positive: { ...EMPTY_BREAKDOWN.positive },
        negative: { ...EMPTY_BREAKDOWN.negative },
        neutral: { ...EMPTY_BREAKDOWN.neutral },
      },
      mostPositive: null,
      mostNegative: null,
    };
  }

  const counts: Record<SentimentLabel, number> = {
    positive: 0,
    negative: 0,
    neutral: 0,
  };

  let total = 0;
  let mostPositive = posts[0];
  let mostNegative = posts[0];

  for (const post of posts) {
    const { compound, label } = post.sentiment;
    total += compound;
    counts[label] += 1;
    if (compound > mostPositive.sentiment.compound) mostPositive = post;
    if (compound < mostNegative.sentiment.compound) mostNegative = post;
  }

  const toBreakdown = (count: number) => ({
    count,
    percentage: round((count / posts.length) * 100, 1),
  });

  return {
    count: posts.length,
    meanCompound: round(total / posts.length),
    breakdown: {
      positive: toBreakdown(counts.positive),
      negative: toBreakdown(counts.negative),
      neutral: toBreakdown(counts.neutral),
    },
    mostPositive,
    mostNegative,
  };
}

/**
 * Compose parsed posts into the API's success body: sentiment on every post,
 * plus the aggregate block. Shared by the route and the check script so the
 * two cannot drift.
 */
export function attachSentiment(
  data: SubredditPosts,
  source: AuthMode,
): SubredditPostsResponse {
  const posts: ScoredPost[] = data.posts.map((post) => ({
    ...post,
    sentiment: scoreTitle(post.title),
  }));

  return {
    subreddit: data.subreddit,
    count: posts.length,
    source,
    posts,
    sentiment: aggregateSentiment(posts),
  };
}
