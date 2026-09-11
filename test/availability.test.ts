import { describe, expect, it } from 'vitest';
import { GAP_S, observe, summarize, WINDOW_DAYS, type Avail } from '../src/availability';

const T0 = Date.parse('2026-09-01T00:00:00Z');
const iso = (ms: number) => new Date(ms).toISOString();
const mins = (n: number) => n * 60_000;

describe('observe', () => {
  it('starts the record on the first arrival', () => {
    const got = observe(null, null, iso(T0));
    expect(got).toMatchObject({ since: iso(T0), last_seen: iso(T0), gaps: [] });
  });

  it('writes nothing for an ordinary on-time arrival', () => {
    // The whole point: a push every five minutes must not cost a KV write, or
    // the free allowance is gone by lunchtime.
    const prev: Avail = { since: iso(T0), last_seen: iso(T0), gaps: [] };
    expect(observe(prev, iso(T0), iso(T0 + mins(5)))).toBeNull();
  });

  it('does not invent a gap just because an hour passed between writes', () => {
    // The bug this test exists for: gap detection once compared against the
    // last *write* rather than the last arrival, so an hourly heartbeat with
    // perfect uptime in between looked like a one-hour outage.
    const prev: Avail = { since: iso(T0), last_seen: iso(T0), gaps: [] };
    const now = T0 + mins(60);
    const got = observe(prev, iso(now - mins(5)), iso(now));
    expect(got?.gaps).toEqual([]);
    expect(got?.last_seen).toBe(iso(now));
  });

  it('records a gap when the previous snapshot was genuinely old', () => {
    const prev: Avail = { since: iso(T0), last_seen: iso(T0), gaps: [] };
    const back = T0 + (GAP_S + 60) * 1000;
    const got = observe(prev, iso(T0), iso(back));
    expect(got?.gaps).toEqual([{ from: iso(T0), to: iso(back) }]);
  });

  it('falls back to the last heartbeat when the snapshot had already expired', () => {
    // Overstates the outage by up to an hour, which claims worse availability
    // than we had — the safe direction to be wrong in.
    const prev: Avail = { since: iso(T0), last_seen: iso(T0), gaps: [] };
    const back = T0 + mins(90);
    const got = observe(prev, null, iso(back));
    expect(got?.gaps).toEqual([{ from: iso(T0), to: iso(back) }]);
  });

  it('forgets gaps that have aged out of the window', () => {
    const old = T0 - (WINDOW_DAYS + 5) * 86400_000;
    const prev: Avail = {
      since: iso(old),
      last_seen: iso(T0),
      gaps: [{ from: iso(old), to: iso(old + mins(30)) }],
    };
    const got = observe(prev, iso(T0 + mins(55)), iso(T0 + mins(60)));
    expect(got?.gaps).toEqual([]);
  });
});

describe('summarize', () => {
  it('reports nothing at all before the first arrival', () => {
    const got = summarize(null, T0);
    expect(got.availability).toBeNull();
    expect(got.window_days).toBe(0);
  });

  it('grows the window rather than claiming ninety days on day one', () => {
    const a: Avail = { since: iso(T0), last_seen: iso(T0 + mins(5)), gaps: [] };
    const got = summarize(a, T0 + 12 * 86400_000 + mins(5));
    expect(got.window_days).toBe(12);
    expect(got.window_target_days).toBe(WINDOW_DAYS);
  });

  it('subtracts recorded outages', () => {
    const a: Avail = {
      since: iso(T0),
      last_seen: iso(T0 + 10 * 86400_000),
      gaps: [{ from: iso(T0 + 86400_000), to: iso(T0 + 86400_000 + mins(60)) }],
    };
    const got = summarize(a, T0 + 10 * 86400_000);
    // One hour lost out of ten days.
    expect(got.availability).toBeCloseTo(1 - 60 / (10 * 24 * 60), 4);
    expect(got.outages).toBe(1);
  });

  it('counts the outage it is currently in, rather than the number from before it', () => {
    // The flattering answer would ignore an open gap and report the
    // availability we had until things broke. That is the wrong answer.
    const a: Avail = { since: iso(T0), last_seen: iso(T0 + 86400_000), gaps: [] };
    const now = T0 + 86400_000 + mins(120);
    const got = summarize(a, now);
    expect(got.outages).toBe(1);
    expect(got.availability).toBeLessThan(1);
  });

  it('is not fooled into reporting above 1 or below 0', () => {
    const a: Avail = {
      since: iso(T0),
      last_seen: iso(T0 + 86400_000),
      gaps: [{ from: iso(T0 - 86400_000 * 400), to: iso(T0 + 86400_000 * 400) }],
    };
    const got = summarize(a, T0 + 86400_000);
    expect(got.availability).toBeGreaterThanOrEqual(0);
    expect(got.availability).toBeLessThanOrEqual(1);
  });

  it('clips a gap to the window rather than counting time before we were watching', () => {
    const a: Avail = {
      since: iso(T0),
      last_seen: iso(T0 + 86400_000),
      gaps: [{ from: iso(T0 - mins(600)), to: iso(T0 + mins(60)) }],
    };
    const got = summarize(a, T0 + 86400_000);
    // Only the hour after `since` counts, not the ten before it.
    expect(got.availability).toBeCloseTo(1 - 60 / (24 * 60), 3);
  });
});
