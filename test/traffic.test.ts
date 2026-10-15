import { describe, expect, it } from 'vitest';
import { LAUNCH, merge, summarize, tally, WINDOW_DAYS, type Traffic } from '../src/traffic';

const NOW = Date.parse('2026-10-15T12:00:00Z');

const daily = (date: string, uniques: number, requests: number, countries: string[] = []) => ({
  dimensions: { date },
  uniq: { uniques },
  sum: { requests, countryMap: countries.map((c) => ({ clientCountryName: c })) },
});

describe('tally', () => {
  it('ignores the parked-domain traffic from before the site existed', () => {
    const got = tally([daily('2026-07-05', 1, 11), daily(LAUNCH, 60, 400)], [], [], []);
    expect(Object.keys(got.days)).toEqual([LAUNCH]);
  });

  it('counts countries as a set and drops the ones that are not places', () => {
    const got = tally(
      [daily('2026-10-01', 5, 9, ['US', 'DE', 'XX']), daily('2026-10-02', 5, 9, ['US', 'T1'])],
      [],
      [],
      [],
    );
    expect(got.countries.sort()).toEqual(['DE', 'US']);
  });

  it('classifies terminal views by the same rule that served them', () => {
    const root = [
      { count: 3, dimensions: { date: '2026-10-01', userAgent: 'curl/8.5.0' } },
      { count: 2, dimensions: { date: '2026-10-01', userAgent: '' } },
      { count: 9, dimensions: { date: '2026-10-01', userAgent: 'Mozilla/5.0 Chrome/140' } },
    ];
    const got = tally([], root, [], ['2026-10-01']);
    expect(got.terminal['2026-10-01']).toBe(5);
  });

  it('records a queried day with no rows as zero, and an unqueried day as absent', () => {
    // Zero is a claim — "we asked and nothing happened" — so it is only made
    // for days that were actually asked about.
    const got = tally([], [], [], ['2026-10-02']);
    expect(got.teapot).toEqual({ '2026-10-02': 0 });
    expect(got.teapot['2026-10-01']).toBeUndefined();
  });
});

describe('merge', () => {
  it('overwrites a re-read day rather than adding to it', () => {
    const first = merge(null, tally([daily('2026-10-01', 5, 10)], [], [], []), 'a');
    const again = merge(first, tally([daily('2026-10-01', 6, 12)], [], [], []), 'b');
    expect(again.days['2026-10-01']).toEqual({ uniques: 6, requests: 12 });
  });
});

describe('summarize', () => {
  const t: Traffic = {
    rolled_at: '2026-10-15T00:17:00Z',
    days: {
      '2026-10-13': { uniques: 100, requests: 1000 },
      '2026-10-14': { uniques: 80, requests: 500 },
    },
    countries: ['DE', 'US'],
    terminal: { '2026-09-15': 4, '2026-10-14': 1 },
    teapot: { '2026-09-15': 0, '2026-10-14': 2 },
  };

  it('never publishes a total of uniques', () => {
    // Summing per-day uniques counts a returning visitor once per day.
    const s = summarize(t, NOW);
    expect(JSON.stringify(s)).not.toMatch(/total_uniques|unique_visitors/);
    expect(s).not.toHaveProperty('uniques');
  });

  it('adds requests, which do add', () => {
    expect(summarize(t, NOW).requests).toBe(1500);
  });

  it('draws the window up to yesterday, with unknown days as null rather than zero', () => {
    const s = summarize(t, NOW);
    expect(s.days).toHaveLength(WINDOW_DAYS);
    expect(s.days.at(-1)).toEqual({ date: '2026-10-14', uniques: 80, requests: 500 });
    expect(s.days.at(-3)).toEqual({ date: '2026-10-12', uniques: null, requests: null });
  });

  it('says when each counter starts, because the sources reach back differently', () => {
    const s = summarize(t, NOW);
    expect(s.terminal_views).toEqual({ count: 5, since: '2026-09-15' });
    expect(s.teapot_refusals).toEqual({ count: 2, since: '2026-09-15' });
  });

  it('is all null, not zero, before the first rollup', () => {
    const s = summarize(null, NOW);
    expect(s.requests).toBeNull();
    expect(s.countries).toBeNull();
    expect(s.terminal_views).toBeNull();
    expect(s.through).toBeNull();
    expect(s.days.every((d) => d.uniques === null)).toBe(true);
  });
});
