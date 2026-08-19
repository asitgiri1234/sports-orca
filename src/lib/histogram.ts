import { NEGATIVE_THRESHOLD, POSITIVE_THRESHOLD } from "./sentiment";
import type { ScoredPost, SentimentAggregate, SentimentLabel } from "./types";

export const BIN_COUNT = 10;
export const BIN_WIDTH = 2 / BIN_COUNT;

export interface HistogramBin {
  /** Inclusive lower edge. */
  start: number;
  /** Exclusive upper edge, except the final bin which includes +1. */
  end: number;
  /** Axis tick: the lower edge, e.g. "-1.0". */
  label: string;
  /** Tooltip text, e.g. "-1.00 to -0.80". */
  rangeLabel: string;
  count: number;
  /**
   * Which colour the bar takes. A bin only counts as positive or negative if
   * the WHOLE bin sits beyond the +/-0.05 threshold; the two bins touching
   * zero contain a mix of neutral and weakly polarised posts, so they stay
   * gray rather than overstating their direction.
   */
  tone: SentimentLabel;
}

function toneForBin(start: number, end: number): SentimentLabel {
  if (start >= POSITIVE_THRESHOLD) return "positive";
  if (end <= NEGATIVE_THRESHOLD) return "negative";
  return "neutral";
}

function edge(value: number): number {
  // Guard against binary float drift like -0.6000000000000001.
  return Math.round(value * 100) / 100;
}

export function buildHistogram(posts: ScoredPost[]): HistogramBin[] {
  const bins: HistogramBin[] = Array.from({ length: BIN_COUNT }, (_, index) => {
    const start = edge(-1 + index * BIN_WIDTH);
    const end = edge(start + BIN_WIDTH);
    return {
      start,
      end,
      label: start.toFixed(1),
      rangeLabel: `${start.toFixed(2)} to ${end.toFixed(2)}`,
      count: 0,
      tone: toneForBin(start, end),
    };
  });

  for (const post of posts) {
    const compound = post.sentiment.compound;
    if (!Number.isFinite(compound)) continue;

    const clamped = Math.min(1, Math.max(-1, compound));
    // +1 lands in the final bin rather than falling off the end.
    const index = Math.min(
      BIN_COUNT - 1,
      Math.floor((clamped + 1) / BIN_WIDTH),
    );
    bins[index].count += 1;
  }

  return bins;
}

export interface BreakdownDatum {
  label: string;
  tone: SentimentLabel;
  count: number;
  percentage: number;
}

/** Ordered negative -> neutral -> positive, so the axis reads as a polarity scale. */
export function buildBreakdown(aggregate: SentimentAggregate): BreakdownDatum[] {
  const order: Array<{ tone: SentimentLabel; label: string }> = [
    { tone: "negative", label: "Negative" },
    { tone: "neutral", label: "Neutral" },
    { tone: "positive", label: "Positive" },
  ];

  return order.map(({ tone, label }) => ({
    label,
    tone,
    count: aggregate.breakdown[tone].count,
    percentage: aggregate.breakdown[tone].percentage,
  }));
}
