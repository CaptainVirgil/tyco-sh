import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import blameData from '../data/blame.json';
import excuseData from '../data/excuses.json';
import severityData from '../data/severity.json';

describe('/api/oncall', () => {
  it('has no escalation path, which is the joke', async () => {
    const res = await SELF.fetch('https://tyco.sh/api/oncall');
    const body = await res.json<{ bus_factor: number; escalation_path: null }>();
    expect(body.bus_factor).toBe(1);
    expect(body.escalation_path).toBeNull();
  });
});

describe('/api/blame', () => {
  it('always names a component from the corpus', async () => {
    const names = new Set(blameData.components.map((c) => c.name));
    for (let i = 0; i < 40; i++) {
      const res = await SELF.fetch('https://tyco.sh/api/blame');
      const body = await res.json<{ blame: string; confidence: number; basis: string }>();
      expect(names).toContain(body.blame);
      expect(body.confidence).toBeGreaterThan(0);
      expect(body.basis).toContain(`n=${blameData.total}`);
    }
  });

  it('quotes a denominator the corpus actually supports', () => {
    // `basis` makes a numeric claim in public. If the counts and the total ever
    // disagree, the site is lying about the one thing it is selling.
    const summed = blameData.components.reduce((n, c) => n + c.count, 0);
    expect(summed).toBe(blameData.total);
  });

  it('is not cached — a cached roll would insist on one component forever', async () => {
    const res = await SELF.fetch('https://tyco.sh/api/blame');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });
});

describe('/api/excuse', () => {
  it('returns an entry from the corpus', async () => {
    const excuses = new Set(excuseData.excuses.map((e) => e.excuse));
    const res = await SELF.fetch('https://tyco.sh/api/excuse');
    const body = await res.json<{ excuse: string; actually_happened: boolean }>();
    expect(excuses).toContain(body.excuse);
    expect(typeof body.actually_happened).toBe('boolean');
  });

  it('marks every entry explicitly — an unmarked one would read as real', () => {
    for (const e of excuseData.excuses) {
      expect(e, e.excuse).toHaveProperty('actually_happened');
      expect(typeof e.actually_happened).toBe('boolean');
    }
  });
});

describe('/api/severity', () => {
  it('returns a level with a first step', async () => {
    const res = await SELF.fetch('https://tyco.sh/api/severity');
    const body = await res.json<{ severity: string; first_step: string }>();
    expect(severityData.levels.map((l) => l.severity)).toContain(body.severity);
    expect(body.first_step.length).toBeGreaterThan(0);
  });

  it('never publishes a runbook', () => {
    for (const l of severityData.levels) {
      expect(l.runbook).toBe('documented, not published');
    }
  });
});

/**
 * The Go side has a typed whitelist guarding the live snapshot. These corpora
 * are hand-written JSON with no type system standing behind them, so they get
 * the same forbidden-string sweep — cheap, and it fails loudly on the mistake
 * most likely to actually happen: pasting a real incident in verbatim.
 */
describe('the baked corpora leak nothing', () => {
  const FORBIDDEN: Array<[string, RegExp]> = [
    ['a private IP', /\b(?:10|192\.168|172\.(?:1[6-9]|2\d|3[01]))\.\d{1,3}\.\d{1,3}\b/],
    // Deliberately structural rather than a list of literal hostnames and the
    // wireless SSID. This repo is public, so spelling those out here would
    // publish exactly the inventory the check exists to keep out of it. The
    // literal terms live with the whitelist test in the private repo, next to
    // the code that actually builds the live snapshot; this sweep is the
    // belt-and-braces pass over hand-written corpora.
    ['a hostname-shaped internal name', /\b[a-z]{3,6}-(?:cp|w|rsp|game)-?\d+\b/i],
    ['a wireless SSID line', /\bssid\b/i],
    ['an internal domain', /\b\w+\.(?:tyco\.sh|tycostation\.com)\b/i],
    ['a k8s object name', /\b(?:namespace|kube-system|longhorn|argocd)\b/i],
    [
      'a named application',
      /\b(?:sonarr|radarr|lidarr|jellyfin|plex|authentik|vaultwarden|opnsense|unifi|proxmox)\b/i,
    ],
    ['a metric or exporter name', /\b(?:unpoller|kube_state|node_exporter|_exporter|promql)\b/i],
    ['a risk register row id', /\b[LMH]\d{3}\b/],
  ];

  const corpora: Array<[string, unknown]> = [
    ['blame.json', blameData],
    ['excuses.json', excuseData],
    ['severity.json', severityData],
  ];

  for (const [name, data] of corpora) {
    const serialized = JSON.stringify(data);
    for (const [what, pattern] of FORBIDDEN) {
      it(`${name} contains no ${what}`, () => {
        const hit = serialized.match(pattern);
        expect(hit?.[0] ?? null, `${name} leaked ${what}: ${hit?.[0]}`).toBeNull();
      });
    }
  }
});
