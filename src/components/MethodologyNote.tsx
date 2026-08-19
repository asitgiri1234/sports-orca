/**
 * Permanently visible, directly under the summary. The headline number is easy
 * to over-read, so the caveats travel with it rather than hiding in a tooltip.
 */
export function MethodologyNote() {
  return (
    <aside className="mt-4 border-l-2 border-line-strong pl-4">
      <h2 className="text-xs font-medium uppercase tracking-widest text-ink-faint">
        How this is scored
      </h2>
      <p className="mt-2 max-w-prose text-sm leading-relaxed text-ink-soft">
        VADER scores each title by looking up words in a fixed sentiment lexicon
        and applying rules for negation and intensifiers. It has no model of
        context, so it misreads sarcasm and irony, and it knows nothing about
        what a word means in one subreddit versus another. Jargon-heavy
        communities skew negative on ordinary technical vocabulary &mdash;
        &ldquo;crash&rdquo;, &ldquo;kill&rdquo;, &ldquo;critical&rdquo;,
        &ldquo;cut&rdquo; &mdash; and finance subs do the same with
        &ldquo;short&rdquo;, &ldquo;bear&rdquo;, and &ldquo;loss&rdquo;, so a
        negative score there often reflects the topic rather than the mood.
      </p>
    </aside>
  );
}
