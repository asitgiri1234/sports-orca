import type { SentimentLabel } from "./types";

export interface Verdict {
  /** A single word summarising the mean compound score. */
  word: string;
  /** Which sentiment colour the word should take. */
  tone: SentimentLabel;
}

/**
 * Turn a mean compound score into one word. The inner bounds match VADER's
 * own +/-0.05 label thresholds so the headline can never contradict the
 * per-post badges beneath it; the outer bounds just add intensity.
 */
export function verdictFor(meanCompound: number): Verdict {
  if (meanCompound >= 0.5) return { word: "Glowing", tone: "positive" };
  if (meanCompound >= 0.05) return { word: "Positive", tone: "positive" };
  if (meanCompound > -0.05) return { word: "Neutral", tone: "neutral" };
  if (meanCompound > -0.5) return { word: "Negative", tone: "negative" };
  return { word: "Hostile", tone: "negative" };
}

/** Format a compound score for display: always signed, always two decimals. */
export function formatCompound(value: number): string {
  const fixed = value.toFixed(2);
  return value > 0 ? `+${fixed}` : fixed;
}

/** Compact counts, so a 24,300-upvote post does not wrap the meta row. */
export function formatCount(value: number): string {
  if (Math.abs(value) < 1000) return String(value);
  const thousands = value / 1000;
  return `${thousands >= 10 ? Math.round(thousands) : thousands.toFixed(1)}k`;
}

export function formatRelativeTime(createdUtc: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.floor(now / 1000 - createdUtc));
  const hours = Math.floor(seconds / 3600);

  if (hours < 1) return `${Math.max(1, Math.floor(seconds / 60))}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
