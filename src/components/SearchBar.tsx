"use client";

import { useId } from "react";

const PRESETS = ["programming", "science", "technology", "worldnews", "aww"];

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (name: string) => void;
  disabled: boolean;
  activeSubreddit: string | null;
}

export function SearchBar({
  value,
  onChange,
  onSubmit,
  disabled,
  activeSubreddit,
}: SearchBarProps) {
  const inputId = useId();

  return (
    <section>
      <form
        onSubmit={(event) => {
          // Covers Enter, since a single-input form submits on Enter natively.
          event.preventDefault();
          onSubmit(value);
        }}
      >
        <label
          htmlFor={inputId}
          className="block text-sm font-medium text-ink-soft"
        >
          Subreddit
        </label>

        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <div className="flex flex-1 items-center rounded-lg border border-line bg-surface focus-within:border-accent focus-within:ring-1 focus-within:ring-accent">
            <span
              aria-hidden="true"
              className="select-none border-r border-line py-2.5 pl-3 pr-2.5 font-mono text-sm text-ink-faint"
            >
              r/
            </span>
            <input
              id={inputId}
              name="subreddit"
              value={value}
              onChange={(event) => onChange(event.target.value)}
              placeholder="programming"
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              // The visible "r/" is decorative, so spell the full thing out here.
              aria-label="Subreddit name, without the r/ prefix"
              className="w-full min-w-0 bg-transparent px-3 py-2.5 text-base text-ink placeholder:text-ink-faint focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={disabled || value.trim().length === 0}
            className="rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-accent-ink transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto"
          >
            {disabled ? "Checking..." : "Check vibe"}
          </button>
        </div>
      </form>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-xs text-ink-faint">Try</span>
        {PRESETS.map((preset) => {
          const isActive = activeSubreddit === preset;
          return (
            <button
              key={preset}
              type="button"
              disabled={disabled}
              aria-pressed={isActive}
              onClick={() => {
                onChange(preset);
                onSubmit(preset);
              }}
              className={`rounded-full border px-3 py-1 font-mono text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
                isActive
                  ? "border-accent bg-accent-wash text-accent"
                  : "border-line bg-surface text-ink-soft hover:border-line-strong hover:text-ink"
              }`}
            >
              r/{preset}
            </button>
          );
        })}
      </div>
    </section>
  );
}
