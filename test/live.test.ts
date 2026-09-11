import { SELF, env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { CADENCE_S, KV_KEY, TTL_S } from '../src/snapshot';

const TOKEN = 'test-token-not-a-real-one';

function validSnapshot(overrides: Record<string, unknown> = {}) {
  return {
    contract: 1,
    as_of: new Date().toISOString(),
    cluster: { nodes: 6, nodes_ready: 6, containers: 145 },
    rack: {
      inlet_c: 21.5,
      draw_w: 410,
      fans_rpm: [4920, 4880],
      chassis: 'a 2U dual-socket server',
    },
    games: { servers: [{ alias: 'project zomboid', up: true, players: 3, max: 16 }] },
    yak: { depth: 4, deepest_this_month: 9 },
    ...overrides,
  };
}

async function push(body: unknown, token = TOKEN) {
  return SELF.fetch('https://tyco.sh/_ingest', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

beforeEach(async () => {
  await env.SNAPSHOT.delete(KV_KEY);
});

describe('/_ingest refuses', () => {
  it('a missing token', async () => {
    const res = await SELF.fetch('https://tyco.sh/_ingest', {
      method: 'PUT',
      body: JSON.stringify(validSnapshot()),
    });
    expect(res.status).toBe(401);
  });

  it('a wrong token', async () => {
    expect((await push(validSnapshot(), 'wrong')).status).toBe(401);
  });

  it('a token of the right length but wrong content', async () => {
    const sameLength = 'x'.repeat(TOKEN.length);
    expect((await push(validSnapshot(), sameLength)).status).toBe(401);
  });

  it('a GET', async () => {
    expect((await SELF.fetch('https://tyco.sh/_ingest')).status).toBe(405);
  });

  it('an oversized body', async () => {
    const fat = validSnapshot({ padding: 'x'.repeat(20 * 1024) });
    expect((await push(fat)).status).toBe(413);
  });

  it('a body that does not parse', async () => {
    expect((await push('{not json')).status).toBe(400);
  });

  it('an unknown contract', async () => {
    expect((await push(validSnapshot({ contract: 99 }))).status).toBe(409);
  });

  it('a timestamp from the future', async () => {
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    expect((await push(validSnapshot({ as_of: future }))).status).toBe(400);
  });

  it('a timestamp too old to be a push', async () => {
    const old = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    expect((await push(validSnapshot({ as_of: old }))).status).toBe(400);
  });

  it('and stores nothing when it refuses', async () => {
    await push(validSnapshot({ contract: 99 }));
    expect(await env.SNAPSHOT.get(KV_KEY)).toBeNull();
  });
});

describe('/_ingest accepts', () => {
  it('a valid snapshot, with the TTL that makes staleness self-correcting', async () => {
    const res = await push(validSnapshot());
    expect(res.status).toBe(200);
    expect(await res.json<{ stored: boolean; ttl_s: number }>()).toEqual({
      stored: true,
      ttl_s: TTL_S,
    });
    expect(await env.SNAPSHOT.get(KV_KEY)).not.toBeNull();
  });
});

describe('/api/snapshot', () => {
  it('says the house may be dark when there is nothing stored', async () => {
    const res = await SELF.fetch('https://tyco.sh/api/snapshot');
    const body = await res.json<{
      stale: boolean;
      as_of: string | null;
      note: string;
      cluster: { nodes: number | null };
      rack: { draw_w: number | null };
    }>();

    expect(body.stale).toBe(true);
    expect(body.as_of).toBeNull();
    expect(body.note).toMatch(/dark/);

    // The load-bearing assertion of this whole project: absent is null, never
    // zero. Zero watts is a claim about the rack; null is a claim about us.
    expect(body.cluster.nodes).toBeNull();
    expect(body.rack.draw_w).toBeNull();
    expect(body.rack.draw_w).not.toBe(0);
  });

  it('serves a fresh snapshot as live', async () => {
    await push(validSnapshot());
    const res = await SELF.fetch('https://tyco.sh/api/snapshot');
    const body = await res.json<{ stale: boolean; cluster: { nodes: number } }>();
    expect(body.stale).toBe(false);
    expect(body.cluster.nodes).toBe(6);
  });

  it('marks a snapshot past two missed pushes as stale, but still shows it', async () => {
    const aged = new Date(Date.now() - (CADENCE_S * 2 + 30) * 1000).toISOString();
    // Written directly: /_ingest would rightly refuse a timestamp this old.
    await env.SNAPSHOT.put(KV_KEY, JSON.stringify(validSnapshot({ as_of: aged })));

    const res = await SELF.fetch('https://tyco.sh/api/snapshot');
    const body = await res.json<{ stale: boolean; cluster: { nodes: number } }>();
    expect(body.stale).toBe(true);
    expect(body.cluster.nodes).toBe(6);
  });

  it('goes dark for a snapshot that outlived its own window', async () => {
    const ancient = new Date(Date.now() - (TTL_S + 600) * 1000).toISOString();
    await env.SNAPSHOT.put(KV_KEY, JSON.stringify(validSnapshot({ as_of: ancient })));

    const res = await SELF.fetch('https://tyco.sh/api/snapshot');
    const body = await res.json<{ stale: boolean; cluster: { nodes: number | null } }>();
    expect(body.stale).toBe(true);
    expect(body.cluster.nodes).toBeNull();
  });

  it('refuses to render a contract it does not know', async () => {
    await env.SNAPSHOT.put(KV_KEY, JSON.stringify(validSnapshot({ contract: 99 })));
    const res = await SELF.fetch('https://tyco.sh/api/snapshot');
    const body = await res.json<{ note: string; cluster: { nodes: number | null } }>();
    expect(body.note).toMatch(/contract/);
    expect(body.cluster.nodes).toBeNull();
  });

  it('does not fall over on stored garbage', async () => {
    await env.SNAPSHOT.put(KV_KEY, 'not json at all');
    const res = await SELF.fetch('https://tyco.sh/api/snapshot');
    expect(res.status).toBe(200);
    expect((await res.json<{ stale: boolean }>()).stale).toBe(true);
  });
});

describe('the baked endpoints survive a dark house', () => {
  it('answers /api/hire with no snapshot at all', async () => {
    await env.SNAPSHOT.delete(KV_KEY);
    const res = await SELF.fetch('https://tyco.sh/api/hire');
    expect(res.status).toBe(200);
    expect((await res.json<{ basics: { name: string } }>()).basics.name).toBe('William Wolff');
  });
});
