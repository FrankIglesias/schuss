// Live-conditions scraper for skiresort.info.
//
// Two-step flow:
//   1. GET /ski-resort/<slug>/snow-report/ and extract the resort's own uid
//      from the inline `Resort uid: NNNN` console.log (only when a slug,
//      rather than a uid, is passed). This is deliberately distinct from the
//      cross-promo `.snowreportLoader` widgets that also appear on the page.
//   2. GET /index.php?eID=mg_skiresort_snowreportteaser&uid=<UID>&l=en&type=wide
//      which returns a small HTML fragment with the live numbers.
//
// Used by:
//   - scripts/refresh-all-conditions.ts (bulk refresh of resort_conditions)

const BASE = "https://www.skiresort.info";
const USER_AGENT =
  "Mozilla/5.0 (compatible; SchussETL/0.1; +https://github.com/) ski-resort-explorer";

export type ConditionsOpenStatus = "open" | "closed" | "partially open";

export type Conditions = {
  slug: string | null;
  uid: number | null;
  teaserUrl: string;
  openStatus: ConditionsOpenStatus | null;
  liftsOpen: number | null;
  liftsTotal: number | null;
  slopesOpenKm: number | null;
  slopesTotalKm: number | null;
  snowDepthTopCm: number | null;
  snowDepthBaseCm: number | null;
};

export async function scrape(opts: { slug?: string; uid?: number }): Promise<Conditions> {
  if (!opts.slug && !opts.uid) throw new Error("pass slug or uid");
  const uid = opts.uid ?? (await fetchUid(opts.slug!));
  const { url, body } = await fetchTeaser(uid);
  return {
    slug: opts.slug ?? null,
    uid,
    teaserUrl: url,
    ...parseTeaser(body),
  };
}

async function fetchUid(slug: string): Promise<number> {
  const url = `${BASE}/ski-resort/${slug}/snow-report/`;
  const res = await fetch(url, { headers: { "user-agent": USER_AGENT } });
  if (!res.ok) throw new Error(`${url} returned HTTP ${res.status}`);
  const html = await res.text();
  // The resort's own uid is embedded as `console.log('Resort uid: NNNN')`,
  // distinct from cross-promo .snowreportLoader widgets on the same page.
  const m = html.match(/Resort uid:\s*(\d+)/);
  if (!m) throw new Error(`no resort uid on ${url} — wrong slug?`);
  return Number(m[1]);
}

async function fetchTeaser(uid: number): Promise<{ url: string; body: string }> {
  const url = `${BASE}/index.php?eID=mg_skiresort_snowreportteaser&uid=${uid}&l=en&type=wide`;
  const res = await fetch(url, { headers: { "user-agent": USER_AGENT } });
  if (!res.ok) throw new Error(`${url} returned HTTP ${res.status}`);
  return { url, body: await res.text() };
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function parseTeaser(body: string): Omit<Conditions, "slug" | "uid" | "teaserUrl"> {
  const text = stripTags(body);
  const num = (s: string) => {
    const n = Number(s.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  };

  const lifts = text.match(/(\d+)\s+of\s+(\d+)\s+lifts/);
  const slopes = text.match(/([\d.,]+)\s+of\s+([\d.,]+)\s+km\s+of\s+slopes/);
  const top = text.match(/(\d+)\s*cm\s*top/);
  const base = text.match(/(\d+)\s*cm\s*base/);
  const status = text.match(/Ski resort\s+(open|closed|partially open)/);

  return {
    openStatus: (status?.[1] as ConditionsOpenStatus | undefined) ?? null,
    liftsOpen: lifts ? num(lifts[1]) : null,
    liftsTotal: lifts ? num(lifts[2]) : null,
    slopesOpenKm: slopes ? num(slopes[1]) : null,
    slopesTotalKm: slopes ? num(slopes[2]) : null,
    snowDepthTopCm: top ? num(top[1]) : null,
    snowDepthBaseCm: base ? num(base[1]) : null,
  };
}
