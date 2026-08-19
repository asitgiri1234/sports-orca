# The Subreddit Vibe Check

Score the sentiment of any subreddit's 50 hottest post titles, and see which words drove the result.

> **On the repo name:** this repository is called `sports-orca` purely because that was the assignment reference. It has nothing to do with sports, or orcas. The project is The Subreddit Vibe Check.

---

## Screenshot

> **Placeholder.** Drop a PNG at `docs/screenshot.png`, then swap in the line below:
>
> `![The Subreddit Vibe Check dashboard](docs/screenshot.png)`

The dashboard is a single page: search bar with preset chips, a headline vibe card,
the methodology note, two distribution charts, and the scored post list with a
per-post "Why this score?" breakdown.

---

## Quick start

**Requires Node 20+** (developed on Node 22).

```bash
git clone https://github.com/asitgiri1234/sports-orca.git
cd sports-orca
npm install
cp .env.local.example .env.local   # then edit it, see below
npm run dev                        # http://localhost:3000
```

### Environment

`.env.local` is gitignored. Copy it from `.env.local.example`.

| Variable | Required | What it does |
| --- | --- | --- |
| `REDDIT_USER_AGENT` | Recommended | Descriptive UA sent on every Reddit request. Reddit blocks generic ones. Falls back to `subreddit-vibe-check/1.0`. |
| `REDDIT_CLIENT_ID` | For live data | OAuth app-only client id. |
| `REDDIT_CLIENT_SECRET` | For live data | OAuth app-only secret. |

To create credentials: sign in to Reddit → <https://www.reddit.com/prefs/apps> → **create another app…** → type **script** → the id is the string under the app name, the secret is the `secret` field.

**Without credentials the app still runs**, falling back to Reddit's public JSON endpoint. In practice Reddit now blocks that endpoint from most datacenter IPs — and increasingly from residential ones — with a `403 "Blocked"` HTML page. If you see `UPSTREAM_ERROR`, that is what happened; add OAuth credentials. The response includes a `source` field (`oauth` or `anonymous`) so you can tell which path served it.

### Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm test` | Unit tests (Vitest) |
| `npm run lint` | ESLint |
| `npm run check:fetch` | End-to-end smoke test: token endpoint, live route, recorded-payload matrix |
| `npm run diagnose` | Raw connectivity probe — dumps Reddit's actual status, headers, and body |

`npm run diagnose` is the one to reach for when something upstream breaks. It distinguishes a genuine subreddit permission error (JSON, with a `reason`) from an IP-reputation block (HTML, `statusText: "Blocked"`).

---

## Why the Reddit fetch is server-side

The browser never talks to Reddit. Every request goes through `/api/subreddit/[name]`. Four reasons, in order of how hard they are to work around:

1. **CORS.** `reddit.com` returns no `Access-Control-Allow-Origin` header for arbitrary web origins. A `fetch()` from the page would be blocked by the browser before the response was ever readable. There is no client-side fix short of a proxy — which is what the route handler is.

2. **User-Agent filtering.** Reddit rejects generic or absent User-Agents and asks for a descriptive one. `User-Agent` is a [forbidden header name](https://developer.mozilla.org/en-US/docs/Glossary/Forbidden_header_name) — the browser will not let JavaScript set it. Only a server can send the UA Reddit wants.

3. **Secrets.** The OAuth client secret is used to mint app-only tokens. Anything shipped to the browser is public, so the token exchange has to happen server-side.

4. **Caching and cost.** The route caches upstream responses for 300s, so repeated lookups of the same subreddit hit Reddit once rather than once per visitor. Sentiment scoring also runs once per fetch on the server instead of in every client.

---

## How the scoring works

Titles are scored with [VADER](https://github.com/cjhutto/vaderSentiment) (`vader-sentiment`), a rule-based sentiment model built for social media text. It handles negation and intensifiers, which matters for post titles: *"not good at all"* comes out negative, where a naive lexicon sum would read the word *good* and call it positive.

Each title gets a **compound** score in `[-1, +1]`, labelled with VADER's standard thresholds:

| Label | Compound |
| --- | --- |
| Positive | `>= 0.05` |
| Neutral | between |
| Negative | `<= -0.05` |

**Token attribution.** VADER only returns a single composite number, so "Why this score?" on each row is computed by **leave-one-out ablation**: the title is re-scored with each word removed, and the difference is that word's contribution. This measures what a word did *in context* rather than looking it up in the dictionary — so in *"not good at all"* the swing is correctly attributed to **not** (−0.78), not to *good*.

The aggregate block reports the mean compound, the label split, and the single most positive and most negative post.

### Limitations — read these before trusting a number

- **It is lexicon-based, not a language model.** It matches words against a fixed list. It does not understand the sentence.
- **Sarcasm and irony read backwards.** *"Great, another framework"* scores positive.
- **No subreddit-specific context.** A word means the same thing everywhere, which is false.
- **Jargon-heavy subs skew negative** on ordinary technical vocabulary — *crash*, *kill*, *critical*, *cut*, *abort*, *dead*. A real example from testing: *"I rewrote our build pipeline and **cut** CI time by 70%"* — unambiguously good news — scores **−0.27**, entirely because of the word *cut*.
- **Finance subs skew negative** the same way, on *short*, *bear*, *loss*, *dump*.
- **Titles only.** Post bodies, comments, and vote ratios are ignored, so this measures how posts are *worded*, not how the community feels.
- **English only**, and a **snapshot** — the hot listing changes by the hour.

The methodology note is shown permanently in the UI under the summary card, not buried in a tooltip, because the headline number invites over-reading.

---

## Project layout

```
src/
  app/
    api/subreddit/[name]/route.ts   HTTP surface: validate, fetch, map errors
    layout.tsx  page.tsx  globals.css
  components/                       Dashboard, SearchBar, SummaryCard,
                                    PostList, DistributionCharts, StateViews
  lib/
    reddit.ts       OAuth, token cache, fetch, response interpretation
    sentiment.ts    VADER scoring, ablation attribution, aggregation
    histogram.ts    Binning for the charts
    errors.ts       One user-facing message per error code
    types.ts        Shared API contract
scripts/
  check-fetch.ts      Smoke test (token / live route / recorded payloads)
  diagnose-reddit.ts  Raw upstream probe
```

The response-interpretation logic in `lib/reddit.ts` is a pure function, so the whole error matrix is testable without a network — which is how it stays verified while Reddit blocks the dev machine.

## API

`GET /api/subreddit/:name`

```jsonc
{
  "subreddit": "programming",
  "count": 50,
  "source": "oauth",            // or "anonymous"
  "posts": [
    {
      "id": "abc123",
      "title": "...",
      "author": "someone",
      "score": 1234,
      "numComments": 56,
      "permalink": "https://www.reddit.com/r/programming/comments/abc123/...",
      "createdUtc": 1710000000,
      "flair": "Discussion",
      "sentiment": {
        "compound": 0.854,
        "label": "positive",
        "topTokens": [{ "token": "love", "contribution": 0.2556 }]
      }
    }
  ],
  "sentiment": {
    "count": 50,
    "meanCompound": -0.09,
    "breakdown": { "positive": { "count": 12, "percentage": 24 } },
    "mostPositive": {},
    "mostNegative": {}
  }
}
```

Errors return `{ "code": "...", "message": "..." }` with a matching status:

| Code | Status | Meaning |
| --- | --- | --- |
| `INVALID_NAME` | 400 | Failed `^[A-Za-z0-9_]{2,21}$`; never left the server |
| `SUBREDDIT_NOT_FOUND` | 404 | No such subreddit, or banned |
| `SUBREDDIT_PRIVATE` | 403 | Exists, but members only |
| `SUBREDDIT_QUARANTINED` | 403 | Behind Reddit's quarantine opt-in |
| `RATE_LIMITED` | 429 | Reddit throttled us |
| `AUTH_ERROR` | 502 | Could not obtain or use an OAuth token |
| `UPSTREAM_ERROR` | 502 | Reddit replied with something unusable (usually an IP block) |
| `NETWORK_ERROR` | 504 | The request never completed — DNS, TLS, timeout |

`UPSTREAM_ERROR` and `NETWORK_ERROR` are deliberately separate: one means Reddit answered and we could not use the answer, the other means we never got an answer. They call for different debugging.

A nonexistent subreddit is detected by **response shape, not status** — Reddit sometimes answers `200` with a search-results page instead of `404`, so the route checks that the listing's children are `t3` (posts) rather than `t5` (subreddits).

## Deployment

Deploys to Vercel with no configuration. Set `REDDIT_USER_AGENT`, `REDDIT_CLIENT_ID`, and `REDDIT_CLIENT_SECRET` as environment variables in the project settings; optionally `NEXT_PUBLIC_SITE_URL` for absolute OG URLs.

Expect the anonymous fallback to fail on Vercel — datacenter IP ranges are blocked harder than residential ones. OAuth credentials are effectively required in production.

## What I'd do next

1. **Verify OAuth against live Reddit.** The token request is confirmed well-formed (Reddit parses the Basic auth and rejects only the fake credentials with a clean JSON 401), and caching and the 401-retry are unit-tested against a mocked fetch — but no real listing has been fetched, because Reddit blocks this network. First job on a machine with working credentials.
2. **Compare against a real classifier.** Run the same titles through a transformer sentiment model and report the disagreement rate. VADER's failure modes are known; quantifying them would make the caveats concrete instead of anecdotal.
3. **Score comments, not just titles.** Titles are the weakest available signal. Top-level comments would measure how the community actually reacted.
4. **Weight by engagement.** A +0.9 post with 12 upvotes currently counts the same as a −0.8 post with 24,000. An upvote-weighted mean would better reflect what people actually saw.
5. **Compare two subreddits side by side**, and track a subreddit over time — the data layer already caches per-subreddit, so a small history table would do it.
6. **Rate-limit the route.** It is an open proxy to Reddit right now; a per-IP limit would stop a visitor burning the app's OAuth quota.
7. **Accessibility audit with real assistive tech.** The chart colours are validated for CVD separation and every colour is paired with a text label, but that has not been checked with an actual screen reader.
