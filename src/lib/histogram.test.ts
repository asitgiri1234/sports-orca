import { describe, expect, it } from "vitest";

import { BIN_COUNT, buildBreakdown, buildHistogram } from "./histogram";
import { aggregateSentiment } from "./sentiment";
import type { ScoredPost } from "./types";

function scored(id: string, compound: number): ScoredPost {
  return {
    id,
    title: `Post ${id}`,
    author: "u",
    score: 1,
    numComments: 0,
    permalink: `https://www.reddit.com/r/x/comments/${id}/`,
    createdUtc: 1_710_000_000,
    flair: null,
    sentiment: {
      compound,
      label:
        compound >= 0.05 ? "positive" : compound <= -0.05 ? "negative" : "neutral",
      topTokens: [],
    },
  };
}

describe("buildHistogram", () => {
  it("always returns 10 bins spanning -1 to +1", () => {
    const bins = buildHistogram([]);

    expect(bins).toHaveLength(BIN_COUNT);
    expect(bins[0].start).toBe(-1);
    expect(bins[BIN_COUNT - 1].end).toBe(1);
    expect(bins.every((bin) => bin.count === 0)).toBe(true);
    // No float drift in the edges.
    expect(bins.map((bin) => bin.start)).toEqual([
      -1, -0.8, -0.6, -0.4, -0.2, 0, 0.2, 0.4, 0.6, 0.8,
    ]);
  });

  it("places scores in the right bin and counts every post exactly once", () => {
    const posts = [
      scored("a", -1),
      scored("b", -0.9),
      scored("c", -0.05),
      scored("d", 0),
      scored("e", 0.3),
      scored("f", 1),
    ];
    const bins = buildHistogram(posts);

    expect(bins.reduce((sum, bin) => sum + bin.count, 0)).toBe(posts.length);
    expect(bins[0].count).toBe(2); // -1 and -0.9
    expect(bins[4].count).toBe(1); // -0.05 in [-0.2, 0)
    expect(bins[5].count).toBe(1); // 0 in [0, 0.2)
    expect(bins[6].count).toBe(1); // 0.3
    expect(bins[9].count).toBe(1); // +1 lands in the last bin, not off the end
  });

  it("clamps out-of-range scores instead of dropping them", () => {
    const bins = buildHistogram([scored("lo", -5), scored("hi", 5)]);

    expect(bins[0].count).toBe(1);
    expect(bins[9].count).toBe(1);
  });

  it("only colours a bin polarised when the whole bin clears the threshold", () => {
    const bins = buildHistogram([]);
    const tones = bins.map((bin) => bin.tone);

    // The two bins touching zero hold a mix, so they stay neutral.
    expect(tones[4]).toBe("neutral"); // [-0.2, 0)
    expect(tones[5]).toBe("neutral"); // [0, 0.2)
    expect(tones[3]).toBe("negative"); // [-0.4, -0.2)
    expect(tones[6]).toBe("positive"); // [0.2, 0.4)
    expect(tones[0]).toBe("negative");
    expect(tones[9]).toBe("positive");
  });
});

describe("buildBreakdown", () => {
  it("orders the bars negative -> neutral -> positive", () => {
    const posts = [scored("a", -0.8), scored("b", 0), scored("c", 0.8)];
    const data = buildBreakdown(aggregateSentiment(posts));

    expect(data.map((d) => d.label)).toEqual(["Negative", "Neutral", "Positive"]);
    expect(data.map((d) => d.count)).toEqual([1, 1, 1]);
    expect(data[0].percentage).toBeCloseTo(33.3, 1);
  });
});
