import { CADENCE_S } from './snapshot';
import type { Env } from './types';

/**
 * Availability, measured by the edge counting what arrives from inside.
 *
 * Nothing in the estate retains this. The metrics store keeps three days and
 * the dead-man worker overwrites a single current-state key, so there is no
 * 90-day number anywhere to read — the edge has to observe it itself.
 *
 * The obvious implementation, a counter bumped on every push, costs a KV write
 * every five minutes. KV's free allowance is around a thousand writes a day and
 * the snapshot already spends 288 of them, so instead of recording every
 * arrival this records only the *absences*: a heartbeat once an hour, plus one
 * write whenever a gap closes. That is roughly 25 writes a day and it answers
 * the same question, because availability is one minus the time we were gone.
 */

export const AVAIL_KEY = 'avail';

/** How long a silence must be before it counts as an outage rather than jitter. */
export const GAP_S = CADENCE_S * 2;

/** How often to persist a heartbeat when nothing is wrong. */
const HEARTBEAT_S = 3600;

/** The reporting window we are working towards. */
export const WINDOW_DAYS = 90;

export interface Gap {
  /** RFC 3339. */
  from: string;
  to: string;
}

export interface Avail {
  /** First push this edge ever saw. The window can never be older than this. */
  since: string;
  /** Last push seen, as persisted — may lag the truth by up to an hour. */
  last_seen: string;
  gaps: Gap[];
}

export interface Uptime {
  availability: number | null;
  window_days: number;
  window_target_days: number;
  outages: number;
  measured_by: string;
  since: string | null;
  /** One entry per UTC day, oldest first. WINDOW_DAYS long, always. */
  days: Day[];
}

/**
 * One day in the strip.
 *
 * `availability` is null for a day we were not yet watching — which is a
 * different fact from a day with no outages, and the strip draws it
 * differently. Before `since` there is no evidence either way, and a run of
 * confident green stretching back before the edge existed would be a lie.
 */
export interface Day {
  /** YYYY-MM-DD, UTC. */
  date: string;
  availability: number | null;
  /** Seconds of outage attributed to this day. */
  down_s: number;
}

/**
 * Fold one arrival into the record, returning the new value only when it is
 * worth a write. `null` means "nothing durable changed" — the common case, and
 * the reason this fits in the write budget.
 */
export function observe(
  prev: Avail | null,
  /**
   * When the *previous* snapshot said it was taken — read before this push
   * overwrote it. This is the true last-arrival time and it costs nothing,
   * because the snapshot is written every push anyway.
   *
   * `null` means the snapshot key had already expired, so all we know is that
   * we were gone for at least its TTL.
   */
  prevSnapshotAsOf: string | null,
  nowISO: string,
): Avail | null {
  const now = Date.parse(nowISO);

  if (!prev) {
    return { since: nowISO, last_seen: nowISO, gaps: [] };
  }

  const lastPersisted = Date.parse(prev.last_seen);
  if (Number.isNaN(lastPersisted)) return { ...prev, last_seen: nowISO };

  // Where the silence started. The previous snapshot is exact; without it we
  // fall back to the last persisted heartbeat, which can only overstate the
  // outage — erring towards claiming worse availability than we had, which is
  // the safe direction to be wrong in.
  const gapStartMs = prevSnapshotAsOf ? Date.parse(prevSnapshotAsOf) : lastPersisted;
  const gapStartISO = prevSnapshotAsOf ?? prev.last_seen;

  const silenceS = (now - gapStartMs) / 1000;

  // A gap closed. This is the one thing we must never fail to record.
  if (silenceS > GAP_S) {
    return {
      ...prev,
      last_seen: nowISO,
      gaps: prune([...prev.gaps, { from: gapStartISO, to: nowISO }], now),
    };
  }

  // Nothing was missed. Persist at most once an hour so the record survives a
  // snapshot expiry — comparing against the last *write*, not the last arrival.
  if ((now - lastPersisted) / 1000 >= HEARTBEAT_S) {
    return { ...prev, last_seen: nowISO, gaps: prune(prev.gaps, now) };
  }

  return null;
}

/** Drop gaps that have fallen out of the window; they can no longer affect the number. */
function prune(gaps: Gap[], nowMs: number): Gap[] {
  const cutoff = nowMs - WINDOW_DAYS * 86400_000;
  return gaps.filter((g) => Date.parse(g.to) >= cutoff);
}

/**
 * The reported number.
 *
 * `nowMs` matters: if the last push is already older than a gap's worth, we are
 * *in* an outage that has not closed yet, and it is counted. Reporting the
 * availability we had before the current outage started would be the flattering
 * answer and the wrong one.
 */
export function summarize(a: Avail | null, nowMs: number): Uptime {
  const measured_by = 'the edge, counting snapshots that arrived from inside';

  if (!a) {
    return {
      availability: null,
      window_days: 0,
      window_target_days: WINDOW_DAYS,
      outages: 0,
      measured_by,
      since: null,
      days: dailySeries(null, nowMs, []),
    };
  }

  const since = Date.parse(a.since);
  const windowStart = Math.max(since, nowMs - WINDOW_DAYS * 86400_000);
  const observedMs = Math.max(0, nowMs - windowStart);

  if (observedMs <= 0) {
    return {
      availability: null,
      window_days: 0,
      window_target_days: WINDOW_DAYS,
      outages: 0,
      measured_by,
      since: a.since,
      days: dailySeries(null, nowMs, []),
    };
  }

  const gaps = [...a.gaps];

  const last = Date.parse(a.last_seen);
  if (!Number.isNaN(last) && (nowMs - last) / 1000 > GAP_S) {
    gaps.push({ from: a.last_seen, to: new Date(nowMs).toISOString() });
  }

  let downMs = 0;
  let outages = 0;
  for (const g of gaps) {
    const from = Math.max(Date.parse(g.from), windowStart);
    const to = Math.min(Date.parse(g.to), nowMs);
    if (to > from) {
      downMs += to - from;
      outages++;
    }
  }

  const availability = Math.max(0, Math.min(1, 1 - downMs / observedMs));

  return {
    availability: Number(availability.toFixed(5)),
    window_days: Math.floor(observedMs / 86400_000),
    window_target_days: WINDOW_DAYS,
    outages,
    measured_by,
    since: a.since,
    // The same gap list the headline number used, including any open one.
    days: dailySeries(a, nowMs, gaps),
  };
}

/**
 * Availability per UTC day across the window.
 *
 * Gaps are clipped to each day's bounds rather than attributed to the day they
 * started, so an outage spanning midnight shows on both days in the proportion
 * it actually occupied. A day is `null` until the edge was watching: the strip
 * renders those as unobserved rather than as perfect.
 */
export function dailySeries(a: Avail | null, nowMs: number, gaps: Gap[]): Day[] {
  const out: Day[] = [];
  const dayMs = 86400_000;

  // Midnight UTC that starts today, then walk back WINDOW_DAYS - 1.
  const todayStart = Math.floor(nowMs / dayMs) * dayMs;
  const since = a ? Date.parse(a.since) : Number.POSITIVE_INFINITY;

  for (let i = WINDOW_DAYS - 1; i >= 0; i--) {
    const start = todayStart - i * dayMs;
    const end = Math.min(start + dayMs, nowMs);
    const date = new Date(start).toISOString().slice(0, 10);

    // Only the part of the day we were actually watching counts as observed.
    const obsStart = Math.max(start, since);
    const observed = end - obsStart;

    if (!a || observed <= 0) {
      out.push({ date, availability: null, down_s: 0 });
      continue;
    }

    let downMs = 0;
    for (const g of gaps) {
      const from = Math.max(Date.parse(g.from), obsStart);
      const to = Math.min(Date.parse(g.to), end);
      if (to > from) downMs += to - from;
    }

    out.push({
      date,
      availability: Number(Math.max(0, Math.min(1, 1 - downMs / observed)).toFixed(5)),
      down_s: Math.round(downMs / 1000),
    });
  }

  return out;
}

export async function readAvail(env: Env): Promise<Avail | null> {
  try {
    return await env.SNAPSHOT.get<Avail>(AVAIL_KEY, 'json');
  } catch {
    return null;
  }
}

/** Called from the ingest path. Writes only when observe() says something changed. */
export async function recordArrival(
  env: Env,
  prevSnapshotAsOf: string | null,
  nowISO: string,
): Promise<void> {
  const prev = await readAvail(env);
  const next = observe(prev, prevSnapshotAsOf, nowISO);
  if (!next) return;
  // No expirationTtl: this is the one key that must outlive an outage. If it
  // expired while the house was dark, the record of the outage would expire
  // with it, which is precisely backwards.
  await env.SNAPSHOT.put(AVAIL_KEY, JSON.stringify(next));
}
