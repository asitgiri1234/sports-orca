import { describe, expect, it } from "vitest";

import {
  NEGATIVE_THRESHOLD,
  POSITIVE_THRESHOLD,
  aggregateSentiment,
  labelFor,
  scoreTitle,
} from "./sentiment";
import type { RedditPost, ScoredPost } from "./types";

function makePost(id: string, title: string): ScoredPost {
  const base: RedditPost = {
    id,
    title,
    author: `user_${id}`,
    score: 100,
    numComments: 10,
    permalink: `https://www.reddit.com/r/test/comments/${id}/`,
    createdUtc: 1_710_000_000,
    flair: null,
  };
  return { ...base, sentiment: scoreTitle(title) };
}

describe("scoreTitle", () => {
  it("scores a clearly positive title as positive", () => {
    const result = scoreTitle(
      "This library is absolutely fantastic and I love the docs",
    );

    expect(result.label).toBe("positive");
    expect(result.compound).toBeGreaterThan(0.5);
    expect(result.compound).toBeLessThanOrEqual(1);
    expect(result.topTokens).toHaveLength(3);
    // The sentiment-bearing words should outrank the filler.
    expect(result.topTokens.map((t) => t.token)).toContain("love");
    expect(result.topTokens[0].contribution).toBeGreaterThan(0);
  });

  it("scores a clearly negative title as negative", () => {
    const result = scoreTitle(
      "Terrible release, this update is a buggy disaster and I hate it",
    );

    expect(result.label).toBe("negative");
    expect(result.compound).toBeLessThan(-0.5);
    expect(result.compound).toBeGreaterThanOrEqual(-1);
    expect(result.topTokens).toHaveLength(3);
    // Every surfaced token should be pulling the score down.
    for (const token of result.topTokens) {
      expect(token.contribution).toBeLessThan(0);
    }
  });

  it("scores a factual title as neutral with nothing to attribute", () => {
    const result = scoreTitle("Rust 1.75 released");

    expect(result.label).toBe("neutral");
    expect(result.compound).toBe(0);
    expect(result.topTokens).toEqual([]);
  });

  it("handles negation: 'not good at all' is negative even though 'good' is positive", () => {
    const negated = scoreTitle("not good at all");
    const plain = scoreTitle("good");

    // The bare adjective is positive...
    expect(plain.label).toBe("positive");
    expect(plain.compound).toBeGreaterThan(0);

    // ...and negating it flips the sentence.
    expect(negated.label).toBe("negative");
    expect(negated.compound).toBeLessThan(0);
    expect(negated.compound).toBeLessThan(plain.compound);

    // Attribution should blame the negator, not the adjective. This is the
    // reason for ablation over a plain lexicon sum: "not" only has an effect
    // in context.
    expect(negated.topTokens[0].token).toBe("not");
    expect(negated.topTokens[0].contribution).toBeLessThan(0);
  });

  it("handles an empty string without throwing", () => {
    const result = scoreTitle("");

    expect(result.compound).toBe(0);
    expect(result.label).toBe("neutral");
    expect(result.topTokens).toEqual([]);
  });

  it("treats a whitespace-only string like an empty one", () => {
    const result = scoreTitle("   \t  ");

    expect(result.compound).toBe(0);
    expect(result.label).toBe("neutral");
    expect(result.topTokens).toEqual([]);
  });

  it("caps attribution at three tokens", () => {
    const result = scoreTitle(
      "great awesome wonderful fantastic amazing superb brilliant excellent",
    );
    expect(result.topTokens.length).toBeLessThanOrEqual(3);
  });
});

describe("labelFor", () => {
  it("uses VADER's standard thresholds, inclusive at both edges", () => {
    expect(labelFor(POSITIVE_THRESHOLD)).toBe("positive");
    expect(labelFor(NEGATIVE_THRESHOLD)).toBe("negative");
    expect(labelFor(0.0499)).toBe("neutral");
    expect(labelFor(-0.0499)).toBe("neutral");
    expect(labelFor(0)).toBe("neutral");
    expect(labelFor(1)).toBe("positive");
    expect(labelFor(-1)).toBe("negative");
  });
});

describe("aggregateSentiment", () => {
  const posts = [
    makePost("p1", "This library is absolutely fantastic and I love the docs"),
    makePost("p2", "Terrible release, this update is a buggy disaster and I hate it"),
    makePost("p3", "Rust 1.75 released"),
    makePost("p4", "not good at all"),
  ];

  it("counts each label and reports percentages that sum to 100", () => {
    const stats = aggregateSentiment(posts);

    expect(stats.count).toBe(4);
    expect(stats.breakdown.positive.count).toBe(1);
    expect(stats.breakdown.negative.count).toBe(2);
    expect(stats.breakdown.neutral.count).toBe(1);

    const total =
      stats.breakdown.positive.percentage +
      stats.breakdown.negative.percentage +
      stats.breakdown.neutral.percentage;
    expect(total).toBeCloseTo(100, 5);
    expect(stats.breakdown.positive.percentage).toBe(25);
  });

  it("computes the mean compound across posts", () => {
    const stats = aggregateSentiment(posts);
    const expected =
      posts.reduce((sum, post) => sum + post.sentiment.compound, 0) / posts.length;

    expect(stats.meanCompound).toBeCloseTo(expected, 3);
  });

  it("picks out the single most positive and most negative post", () => {
    const stats = aggregateSentiment(posts);

    expect(stats.mostPositive?.id).toBe("p1");
    expect(stats.mostNegative?.id).toBe("p2");
  });

  it("returns a zeroed aggregate for an empty list", () => {
    const stats = aggregateSentiment([]);

    expect(stats.count).toBe(0);
    expect(stats.meanCompound).toBe(0);
    expect(stats.mostPositive).toBeNull();
    expect(stats.mostNegative).toBeNull();
    expect(stats.breakdown.positive).toEqual({ count: 0, percentage: 0 });
    expect(stats.breakdown.negative).toEqual({ count: 0, percentage: 0 });
    expect(stats.breakdown.neutral).toEqual({ count: 0, percentage: 0 });
  });
});
