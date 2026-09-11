import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

const CURL = { 'User-Agent': 'curl/8.5.0', Accept: '*/*' };
const BROWSER = {
  'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) Chrome/140.0',
  Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
};

describe('/', () => {
  it('serves plain text to a terminal', async () => {
    const res = await SELF.fetch('https://tyco.sh/', { headers: CURL });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/plain');
    expect(await res.text()).toContain('curl tyco.sh/api/hire');
  });

  it('serves the page to a browser', async () => {
    const res = await SELF.fetch('https://tyco.sh/', { headers: BROWSER });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/html');
    expect(await res.text()).toContain('<title>William Wolff</title>');
  });
});

describe('/api/endpoints', () => {
  it('lists every route, and nothing it lists 404s', async () => {
    const res = await SELF.fetch('https://tyco.sh/api/endpoints');
    const { endpoints } = await res.json<{
      endpoints: { path: string; describe: string; live: boolean }[];
    }>();

    expect(endpoints.length).toBeGreaterThan(0);

    // The index and the router read the same table, so a documented route that
    // does not resolve would mean the table itself is wrong. /api/it-was-not-dns
    // is the one legitimate 404 — it is documented precisely because it 404s.
    for (const e of endpoints) {
      const probe = await SELF.fetch(`https://tyco.sh${e.path}`);
      const allowed = e.path === '/api/it-was-not-dns' ? [404] : [200, 302, 418];
      expect(allowed, `${e.path} returned ${probe.status}`).toContain(probe.status);
    }
  });
});

describe('/api/hire', () => {
  it('answers with JSON Resume by default', async () => {
    const res = await SELF.fetch('https://tyco.sh/api/hire');
    expect(res.status).toBe(200);
    const body = await res.json<{ basics: { name: string }; meta: { version: string } }>();
    expect(body.basics.name).toBe('William Wolff');
    expect(body.meta.version).toBeTruthy();
  });

  it('answers in plain text when asked', async () => {
    const res = await SELF.fetch('https://tyco.sh/api/hire', {
      headers: { Accept: 'text/plain' },
    });
    expect(res.headers.get('Content-Type')).toContain('text/plain');
    const body = await res.text();
    expect(body).toContain('William Wolff');
    // 80 columns, because the thing asking for text is a terminal.
    for (const line of body.split('\n')) expect(line.length).toBeLessThanOrEqual(80);
  });

  it('sends a browser to the page rather than a wall of JSON', async () => {
    const res = await SELF.fetch('https://tyco.sh/api/hire', {
      headers: BROWSER,
      redirect: 'manual',
    });
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toContain('/#work');
  });

  it('answers with JSON even when the asset store is empty', async () => {
    // The plaintext form is a served asset; if it is missing, hire must still
    // answer rather than 500. It is the one endpoint that always has to work.
    const { hire } = await import('../src/api/hire');
    const noAssets = {
      ASSETS: { fetch: async () => new Response('nope', { status: 404 }) },
    } as unknown as Parameters<typeof hire>[2];

    const res = await hire(
      new Request('https://tyco.sh/api/hire', { headers: { Accept: 'text/plain' } }),
      new URL('https://tyco.sh/'),
      noAssets,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('application/json');
  });
});

describe('the jokes', () => {
  it('is always DNS', async () => {
    const res = await SELF.fetch('https://tyco.sh/api/is-it-dns');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ dns: true });
  });

  it('was not DNS, and says so with a 404', async () => {
    const res = await SELF.fetch('https://tyco.sh/api/it-was-not-dns');
    expect(res.status).toBe(404);
    expect(await res.json<{ hint: string }>()).toMatchObject({ hint: 'try /api/is-it-dns' });
  });

  it('is a teapot', async () => {
    const res = await SELF.fetch('https://tyco.sh/api/coffee');
    expect(res.status).toBe(418);
    expect(await res.json<{ brewing: boolean }>()).toMatchObject({ brewing: false });
  });
});

describe('router', () => {
  it('answers an unknown /api path in JSON, not the 404 page', async () => {
    const res = await SELF.fetch('https://tyco.sh/api/nope');
    expect(res.status).toBe(404);
    expect(res.headers.get('Content-Type')).toContain('application/json');
  });

  it('ignores a trailing slash', async () => {
    const res = await SELF.fetch('https://tyco.sh/api/is-it-dns/');
    expect(res.status).toBe(200);
  });

  it('refuses a POST — there are none', async () => {
    const res = await SELF.fetch('https://tyco.sh/api/hire', { method: 'POST' });
    expect(res.status).toBe(405);
  });

  it('stamps the contract on every API response', async () => {
    const res = await SELF.fetch('https://tyco.sh/api/is-it-dns');
    expect(res.headers.get('X-Tyco-Contract')).toBe('1');
  });
});

describe('alias hostnames', () => {
  it.each(['tycostation.com', 'www.tycostation.com', 'www.tyco.sh'])(
    '301s %s to the apex',
    async (host) => {
      const res = await SELF.fetch(`https://${host}/api/is-it-dns?x=1`, { redirect: 'manual' });
      expect(res.status).toBe(301);
      expect(res.headers.get('Location')).toBe('https://tyco.sh/api/is-it-dns?x=1');
    },
  );

  it('leaves real subdomains alone — they resolve to their own hosts', async () => {
    // mail. and vpn. on tycostation.com are live services. If they ever reach
    // this Worker, redirecting them would break them.
    const res = await SELF.fetch('https://mail.tycostation.com/', { redirect: 'manual' });
    expect(res.status).not.toBe(301);
  });

  it('does not redirect the apex to itself', async () => {
    const res = await SELF.fetch('https://tyco.sh/api/is-it-dns', { redirect: 'manual' });
    expect(res.status).toBe(200);
  });
});
