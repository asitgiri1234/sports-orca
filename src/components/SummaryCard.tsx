import type { SentimentAggregate, SentimentLabel } from "@/lib/types";
import { formatCompound, verdictFor } from "@/lib/verdict";

const TONE_TEXT: Record<SentimentLabel, string> = {
  positive: "text-positive",
  negative: "text-negative",
  neutral: "text-flat",
};

const BAR_FILL: Record<SentimentLabel, string> = {
  positive: "bg-positive",
  negative: "bg-negative",
  neutral: "bg-flat",
};

const ROW_ORDER: SentimentLabel[] = ["positive", "neutral", "negative"];

const ROW_LABEL: Record<SentimentLabel, string> = {
  positive: "Positive",
  neutral: "Neutral",
  negative: "Negative",
};

interface SummaryCardProps {
  subreddit: string;
  aggregate: SentimentAggregate;
}

export function SummaryCard({ subreddit, aggregate }: SummaryCardProps) {
  const verdict = verdictFor(aggregate.meanCompound);

  return (
    <section
      aria-labelledby="summary-heading"
      className="rounded-xl border border-line bg-surface p-5 sm:p-7"
    >
      <h2
        id="summary-heading"
        className="text-xs font-medium uppercase tracking-widest text-ink-faint"
      >
        Overall vibe &middot; r/{subreddit}
      </h2>

      <div className="mt-5 flex flex-col gap-7 sm:flex-row sm:items-start sm:gap-10">
        {/* Headline number */}
        <div className="shrink-0">
          <div className="flex items-baseline gap-3">
            <span
              className={`font-mono text-5xl font-semibold tabular-nums tracking-tight sm:text-6xl ${TONE_TEXT[verdict.tone]}`}
            >
              {formatCompound(aggregate.meanCompound)}
            </span>
            <span className={`text-xl font-semibold ${TONE_TEXT[verdict.tone]}`}>
              {verdict.word}
            </span>
          </div>
          <p className="mt-2 max-w-xs text-sm text-ink-soft">
            Mean VADER compound score across {aggregate.count}{" "}
            {aggregate.count === 1 ? "post" : "posts"}, on a scale of -1 to +1.
          </p>
        </div>

        {/* Percentage breakdown */}
        <div className="min-w-0 flex-1">
          <div
            className="flex h-2 overflow-hidden rounded-full bg-flat-wash"
            role="img"
            aria-label={ROW_ORDER.map(
              (label) =>
                `${ROW_LABEL[label]} ${aggregate.breakdown[label].percentage}%`,
            ).join(", ")}
          >
            {ROW_ORDER.map((label) => {
              const { percentage } = aggregate.breakdown[label];
              if (percentage === 0) return null;
              return (
                <div
                  key={label}
                  className={BAR_FILL[label]}
                  style={{ width: `${percentage}%` }}
                />
              );
            })}
          </div>

          <dl className="mt-4 space-y-2">
            {ROW_ORDER.map((label) => {
              const entry = aggregate.breakdown[label];
              return (
                <div key={label} className="flex items-center gap-3 text-sm">
                  <span
                    aria-hidden="true"
                    className={`h-2 w-2 shrink-0 rounded-full ${BAR_FILL[label]}`}
                  />
                  <dt className="flex-1 text-ink-soft">{ROW_LABEL[label]}</dt>
                  <dd className="font-mono tabular-nums text-ink">
                    {entry.percentage}%
                    <span className="ml-2 text-ink-faint">({entry.count})</span>
                  </dd>
                </div>
              );
            })}
          </dl>
        </div>
      </div>

      {(aggregate.mostPositive || aggregate.mostNegative) && (
        <div className="mt-7 grid gap-4 border-t border-line pt-5 sm:grid-cols-2">
          {aggregate.mostPositive && (
            <Extreme
              caption="Most positive"
              tone="positive"
              title={aggregate.mostPositive.title}
              score={aggregate.mostPositive.sentiment.compound}
            />
          )}
          {aggregate.mostNegative && (
            <Extreme
              caption="Most negative"
              tone="negative"
              title={aggregate.mostNegative.title}
              score={aggregate.mostNegative.sentiment.compound}
            />
          )}
        </div>
      )}
    </section>
  );
}

function Extreme({
  caption,
  tone,
  title,
  score,
}: {
  caption: string;
  tone: SentimentLabel;
  title: string;
  score: number;
}) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium uppercase tracking-wider text-ink-faint">
        {caption}
      </p>
      <p className="mt-1.5 flex items-start gap-2 text-sm text-ink">
        <span
          className={`shrink-0 font-mono tabular-nums ${TONE_TEXT[tone]}`}
        >
          {formatCompound(score)}
        </span>
        <span className="min-w-0 break-words">{title}</span>
      </p>
    </div>
  );
}
