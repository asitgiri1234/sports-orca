/**
 * Low-level connectivity probe. Hits Reddit directly, with no Next.js layer in
 * between, and dumps the raw status, headers, and body prefix.
 *
 *   npm run diagnose
 *
 * Use this when the app reports NETWORK_ERROR or UPSTREAM_ERROR and you need to
 * see what Reddit actually said - notably whether a 403 is a real subreddit
 * permission error (JSON, with a `reason`) or an IP-reputation block (HTML,
 * statusText "Blocked"). Reddit blocks datacenter IPs aggressively, so this is
 * worth re-running from any new deploy target.
 */
const USER_AGENT =
  process.env.REDDIT_USER_AGENT ?? "subreddit-vibe-check/1.0";

const TARGETS = [
  "https://www.reddit.com/r/programming/hot.json?limit=50",
  "https://oauth.reddit.com/r/programming/hot?limit=5",
  "https://www.reddit.com/api/v1/access_token",
];

async function probe(url: string, init?: RequestInit) {
  console.log("");
  console.log("=".repeat(72));
  console.log(`GET ${url}`);
  console.log(`User-Agent: ${USER_AGENT}`);
  console.log("=".repeat(72));

  try {
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
      ...init,
    });

    const body = await response.text().catch(() => "<unreadable>");

    console.log(`OUTCOME:    responded (did not throw)`);
    console.log(`status:     ${response.status}`);
    console.log(`statusText: ${JSON.stringify(response.statusText)}`);
    console.log(`redirected: ${response.redirected}`);
    console.log(`headers:`);
    for (const [key, value] of [...response.headers.entries()].sort()) {
      console.log(`  ${key}: ${value}`);
    }
    console.log(`body length: ${body.length}`);
    console.log(`body[0:500]:`);
    console.log(body.slice(0, 500));
  } catch (error) {
    const err = error as NodeJS.ErrnoException & { cause?: unknown };
    console.log(`OUTCOME:    THREW (network / DNS / TLS / timeout)`);
    console.log(`name:       ${err?.name}`);
    console.log(`code:       ${err?.code}`);
    console.log(`message:    ${err?.message}`);
    console.log(`cause:      ${JSON.stringify(err?.cause, null, 2)}`);
  }
}

async function main() {
  for (const url of TARGETS) {
    await probe(url);
  }

  // Sanity check that outbound HTTPS works at all from here.
  await probe("https://example.com/");
}

void main();
