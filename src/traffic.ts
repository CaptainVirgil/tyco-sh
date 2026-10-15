import { isTerminalAgent } from './negotiate';
import type { Env } from './types';

/**
 * Who has been here, as Cloudflare counted it.
 *
 * Nothing about a visitor is recorded by this Worker. Every number comes from
 * the zone's own analytics, read back once an hour by a cron and folded into
 * one KV key. That keeps IPs and user agents out of anything this site stores,
 * costs a write only when a number moved, and means history could be backfilled
 * rather than starting from zero on the day the counter shipped.
 *
 * Two things this deliberately does not publish:
 *
 * - **A total of unique visitors.** Cloudflare counts uniques per day. Adding
 *   days together counts a returning visitor once per day they came back, so
 *   the sum is a number that looks like an answer and is not one. Per-day
 *   uniques are honest; their total is not.
 * - **A count of people.** Bots are in every one of these numbers. Most of the
 *   terminal views are scanners, not someone reading the page in a shell.
 */

export const TRAFFIC_KEY = 'traffic';

/**
 * The day the Worker took the apex. The zone existed before the site did, and
 * a handful of requests a week to a parked domain is not this page's traffic.
 */
export const LAUNCH = '2026-09-11';

/** The reporting window, matching the uptime strip so the two line up. */
export const WINDOW_DAYS = 90;

/**
 * How far back per-request analytics reach on this plan. Daily totals go back
 * a year; anything filtered by path or user agent only a month. Kept a day
 * short of the real limit so a slow cron does not ask for an hour too many.
 */
const ADAPTIVE_DAYS = 30;

/** Days re-read on every run, because the most recent day keeps settling. */
const SETTLE_DAYS = 2;

const GRAPHQL = 'https://api.cloudflare.com/client/v4/graphql';

export interface DayCount {
  uniques: number;
  requests: number;
}

/** Everything stored, keyed by UTC date so a re-read overwrites rather than adds. */
export interface Traffic {
  rolled_at: string;
  days: Record<string, DayCount>;
  countries: string[];
  /** Times `/` was answered as plain text. */
  terminal: Record<string, number>;
  /** Times /api/coffee was asked for coffee and answered 418. */
  teapot: Record<string, number>;
}

export interface Counter {
  count: number;
  /** First date this counter has data for — later than LAUNCH when the source did not reach back that far. */
  since: string;
}

export interface TrafficSummary {
  source: string;
  note: string;
  since: string;
  /** Last complete UTC day included. Today is never counted until it is over. */
  through: string | null;
  requests: number | null;
  countries: number | null;
  terminal_views: Counter | null;
  teapot_refusals: Counter | null;
  days: { date: string; uniques: number | null; requests: number | null }[];
}

const DAY_MS = 86400_000;
const dateOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * The published shape. Pure, so the whole honesty argument above is testable
 * without a network.
 */
export function summarize(t: Traffic | null, nowMs: number): TrafficSummary {
  const todayStart = Math.floor(nowMs / DAY_MS) * DAY_MS;
  const days: TrafficSummary['days'] = [];
  for (let i = WINDOW_DAYS; i >= 1; i--) {
    const date = dateOf(todayStart - i * DAY_MS);
    const d = t?.days[date];
    days.push({ date, uniques: d?.uniques ?? null, requests: d?.requests ?? null });
  }

  const dates = t ? Object.keys(t.days).sort() : [];

  return {
    source: "Cloudflare's analytics for this zone, rolled up hourly",
    note: 'uniques are per day and include bots. Days cannot be added into a visitor total, so none is given',
    since: LAUNCH,
    through: dates.at(-1) ?? null,
    requests: dates.length ? dates.reduce((n, d) => n + t!.days[d]!.requests, 0) : null,
    countries: t && t.countries.length ? t.countries.length : null,
    terminal_views: counter(t?.terminal),
    teapot_refusals: counter(t?.teapot),
    days,
  };
}

function counter(m: Record<string, number> | undefined): Counter | null {
  const dates = m ? Object.keys(m).sort() : [];
  if (!dates.length) return null;
  return { count: dates.reduce((n, d) => n + m![d]!, 0), since: dates[0]! };
}

/**
 * Fold freshly read days into the record. Every date in a result replaces what
 * was stored for it, so running twice over the same window cannot double count.
 */
export function merge(prev: Traffic | null, fresh: Fresh, nowISO: string): Traffic {
  const next: Traffic = prev
    ? {
        ...prev,
        days: { ...prev.days },
        terminal: { ...prev.terminal },
        teapot: { ...prev.teapot },
      }
    : { rolled_at: nowISO, days: {}, countries: [], terminal: {}, teapot: {} };

  Object.assign(next.days, fresh.days);
  Object.assign(next.terminal, fresh.terminal);
  Object.assign(next.teapot, fresh.teapot);
  next.countries = [...new Set([...next.countries, ...fresh.countries])].sort();
  next.rolled_at = nowISO;
  return next;
}

export interface Fresh {
  days: Record<string, DayCount>;
  countries: string[];
  terminal: Record<string, number>;
  teapot: Record<string, number>;
}

interface DailyRow {
  dimensions: { date: string };
  uniq: { uniques: number };
  sum: { requests: number; countryMap: { clientCountryName: string }[] };
}

interface AdaptiveRow {
  count: number;
  dimensions: { date: string; userAgent?: string };
}

/**
 * Turn raw analytics rows into per-day counts.
 *
 * A day inside the queried range with no rows is a real zero — it was asked
 * about and nothing happened — so every such date is filled in explicitly. A
 * day outside the range is simply absent, which is a different fact.
 */
export function tally(
  daily: DailyRow[],
  root: AdaptiveRow[],
  tea: AdaptiveRow[],
  adaptiveDates: string[],
): Fresh {
  const out: Fresh = { days: {}, countries: [], terminal: {}, teapot: {} };
  const countries = new Set<string>();

  for (const r of daily) {
    if (r.dimensions.date < LAUNCH) continue;
    out.days[r.dimensions.date] = { uniques: r.uniq.uniques, requests: r.sum.requests };
    for (const c of r.sum.countryMap) {
      // "XX" and "T1" are Cloudflare's unknown and Tor, not places.
      if (/^[A-Z]{2}$/.test(c.clientCountryName) && c.clientCountryName !== 'XX') {
        countries.add(c.clientCountryName);
      }
    }
  }

  for (const d of adaptiveDates) {
    if (d < LAUNCH) continue;
    out.terminal[d] = 0;
    out.teapot[d] = 0;
  }
  for (const r of root) {
    const d = r.dimensions.date;
    if (d in out.terminal && isTerminalAgent(r.dimensions.userAgent ?? '')) {
      out.terminal[d]! += r.count;
    }
  }
  for (const r of tea) {
    const d = r.dimensions.date;
    if (d in out.teapot) out.teapot[d]! += r.count;
  }

  out.countries = [...countries];
  return out;
}

async function query<T>(env: Env, q: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch(GRAPHQL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.CF_ANALYTICS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: q, variables }),
  });
  const body = await res.json<{ data: T | null; errors: { message: string }[] | null }>();
  if (!res.ok || body.errors?.length || !body.data) {
    throw new Error(`analytics: ${body.errors?.[0]?.message ?? res.status}`);
  }
  return body.data;
}

const DAILY_Q = `query ($zone: String!, $from: Date!, $to: Date!) {
  viewer { zones(filter: { zoneTag: $zone }) {
    httpRequests1dGroups(limit: 1000, orderBy: [date_ASC], filter: { date_geq: $from, date_leq: $to }) {
      dimensions { date }
      uniq { uniques }
      sum { requests countryMap { clientCountryName } }
    }
  } }
}`;

const ADAPTIVE_Q = `query ($zone: String!, $from: Time!, $to: Time!) {
  viewer { zones(filter: { zoneTag: $zone }) {
    root: httpRequestsAdaptiveGroups(limit: 10000, filter: {
      datetime_geq: $from, datetime_lt: $to, clientRequestHTTPHost: "tyco.sh", clientRequestPath: "/"
    }) { count dimensions { date userAgent } }
    tea: httpRequestsAdaptiveGroups(limit: 1000, filter: {
      datetime_geq: $from, datetime_lt: $to, clientRequestHTTPHost: "tyco.sh", clientRequestPath: "/api/coffee"
    }) { count dimensions { date } }
  } }
}`;

/**
 * The cron. Reads complete days only, re-reads the last couple because they
 * keep settling, and writes only when something actually changed.
 */
export async function rollup(env: Env, nowMs: number = Date.now()): Promise<'wrote' | 'unchanged'> {
  if (!env.CF_ANALYTICS_TOKEN || !env.CF_ANALYTICS_ZONE) {
    throw new Error('analytics secrets are not set');
  }

  const prev = await env.SNAPSHOT.get<Traffic>(TRAFFIC_KEY, 'json');
  const todayStart = Math.floor(nowMs / DAY_MS) * DAY_MS;
  const yesterday = dateOf(todayStart - DAY_MS);

  const lastDone = prev ? Object.keys(prev.days).sort().at(-1) : undefined;
  const dailyFrom = lastDone
    ? dateOf(Math.max(Date.parse(LAUNCH), Date.parse(lastDone) - SETTLE_DAYS * DAY_MS))
    : LAUNCH;
  if (dailyFrom > yesterday) return 'unchanged';

  const adaptiveStart = Math.max(
    todayStart - ADAPTIVE_DAYS * DAY_MS,
    Date.parse(dailyFrom),
    Date.parse(LAUNCH),
  );
  const adaptiveDates: string[] = [];
  for (let ms = adaptiveStart; ms < todayStart; ms += DAY_MS) adaptiveDates.push(dateOf(ms));

  const zone = env.CF_ANALYTICS_ZONE;
  const [daily, adaptive] = await Promise.all([
    query<{ viewer: { zones: { httpRequests1dGroups: DailyRow[] }[] } }>(env, DAILY_Q, {
      zone,
      from: dailyFrom,
      to: yesterday,
    }),
    adaptiveDates.length
      ? query<{ viewer: { zones: { root: AdaptiveRow[]; tea: AdaptiveRow[] }[] } }>(
          env,
          ADAPTIVE_Q,
          {
            zone,
            from: new Date(adaptiveStart).toISOString(),
            to: new Date(todayStart).toISOString(),
          },
        )
      : null,
  ]);

  const z = daily.viewer.zones[0];
  const a = adaptive?.viewer.zones[0];
  const fresh = tally(z?.httpRequests1dGroups ?? [], a?.root ?? [], a?.tea ?? [], adaptiveDates);

  const next = merge(prev, fresh, new Date(nowMs).toISOString());
  if (prev && sameCounts(prev, next)) return 'unchanged';

  // No TTL: this is history, and an expired key would silently throw away the
  // part the analytics no longer reach.
  await env.SNAPSHOT.put(TRAFFIC_KEY, JSON.stringify(next));
  return 'wrote';
}

function sameCounts(a: Traffic, b: Traffic): boolean {
  const strip = (t: Traffic) => JSON.stringify({ ...t, rolled_at: '' });
  return strip(a) === strip(b);
}

export async function readTraffic(env: Env): Promise<Traffic | null> {
  try {
    return await env.SNAPSHOT.get<Traffic>(TRAFFIC_KEY, 'json');
  } catch {
    return null;
  }
}
