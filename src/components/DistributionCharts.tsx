"use client";

import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  buildBreakdown,
  buildHistogram,
  type HistogramBin,
} from "@/lib/histogram";
import type { ScoredPost, SentimentAggregate, SentimentLabel } from "@/lib/types";

/**
 * Fills come from CSS custom properties so both charts re-colour with the
 * theme without re-rendering. The steps are validated as a diverging scale.
 */
const FILL: Record<SentimentLabel, string> = {
  positive: "var(--color-chart-positive)",
  neutral: "var(--color-chart-neutral)",
  negative: "var(--color-chart-negative)",
};

const AXIS_TICK = { fontSize: 11, fill: "var(--color-ink-faint)" };

function Panel({
  title,
  caption,
  children,
}: {
  title: string;
  caption: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4 sm:p-5">
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      <p className="mt-1 text-xs leading-relaxed text-ink-soft">{caption}</p>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function TooltipShell({ lines }: { lines: string[] }) {
  return (
    <div className="rounded-lg border border-line-strong bg-surface px-3 py-2 shadow-sm">
      {lines.map((line, index) => (
        <p
          key={line}
          className={
            index === 0
              ? "text-xs font-medium text-ink"
              : "mt-0.5 text-xs text-ink-soft"
          }
        >
          {line}
        </p>
      ))}
    </div>
  );
}

interface DistributionChartsProps {
  posts: ScoredPost[];
  aggregate: SentimentAggregate;
}

export function DistributionCharts({ posts, aggregate }: DistributionChartsProps) {
  const breakdown = buildBreakdown(aggregate);
  const histogram = buildHistogram(posts);

  return (
    <section aria-labelledby="charts-heading" className="mt-8">
      <h2 id="charts-heading" className="sr-only">
        Sentiment distribution charts
      </h2>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title="Label distribution"
          caption={`How many of the ${aggregate.count} scored ${
            aggregate.count === 1 ? "post" : "posts"
          } fall into each sentiment label.`}
        >
          <ResponsiveContainer width="100%" height={200}>
            <BarChart
              data={breakdown}
              margin={{ top: 16, right: 8, bottom: 0, left: -20 }}
            >
              <XAxis
                dataKey="label"
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={{ stroke: "var(--color-chart-grid)" }}
              />
              <YAxis
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
                width={40}
              />
              <Tooltip
                cursor={{ fill: "var(--color-flat-wash)" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const datum = payload[0].payload as (typeof breakdown)[number];
                  return (
                    <TooltipShell
                      lines={[
                        datum.label,
                        `${datum.count} posts / ${datum.percentage}%`,
                      ]}
                    />
                  );
                }}
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={64}>
                {breakdown.map((datum) => (
                  <Cell key={datum.tone} fill={FILL[datum.tone]} />
                ))}
                {/* Direct labels: the CVD separation of this scale is only
                    acceptable with a secondary encoding. */}
                <LabelList
                  dataKey="count"
                  position="top"
                  offset={8}
                  style={{ fontSize: 11, fill: "var(--color-ink-soft)" }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel
          title="Compound score distribution"
          caption="Each bar is a 0.2-wide band from -1 to +1. The two bars either side of zero are gray because they hold both neutral and weakly polarised posts."
        >
          <ResponsiveContainer width="100%" height={200}>
            <BarChart
              data={histogram}
              margin={{ top: 16, right: 8, bottom: 0, left: -20 }}
            >
              <XAxis
                dataKey="label"
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={{ stroke: "var(--color-chart-grid)" }}
                interval={1}
              />
              <YAxis
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
                width={40}
              />
              <Tooltip
                cursor={{ fill: "var(--color-flat-wash)" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const bin = payload[0].payload as HistogramBin;
                  return (
                    <TooltipShell
                      lines={[
                        bin.rangeLabel,
                        `${bin.count} ${bin.count === 1 ? "post" : "posts"}`,
                      ]}
                    />
                  );
                }}
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {histogram.map((bin) => (
                  <Cell key={bin.start} fill={FILL[bin.tone]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      </div>
    </section>
  );
}
