import { CONTRACT } from './contract';

/** Seconds. The snapshot changes every 30s; nothing here is worth a shorter edge cache. */
const DEFAULT_MAX_AGE = 30;

function baseHeaders(maxAge: number): Record<string, string> {
  return {
    'X-Tyco-Contract': String(CONTRACT),
    // maxAge 0 means "this answer is supposed to differ every call" — a cached
    // /api/blame would pick one component and then insist on it forever, which
    // is a different joke and a worse one.
    'Cache-Control': maxAge <= 0 ? 'no-store' : `public, max-age=${maxAge}`,
  };
}

export function json(body: unknown, init: { status?: number; maxAge?: number } = {}): Response {
  const { status = 200, maxAge = DEFAULT_MAX_AGE } = init;
  // Pretty-printed and newline-terminated on purpose: most of this API is read
  // by a human with `curl` and no `jq` in the pipe.
  return new Response(JSON.stringify(body, null, 2) + '\n', {
    status,
    headers: {
      ...baseHeaders(maxAge),
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}

export function text(body: string, init: { status?: number; maxAge?: number } = {}): Response {
  const { status = 200, maxAge = DEFAULT_MAX_AGE } = init;
  return new Response(body.endsWith('\n') ? body : body + '\n', {
    status,
    headers: {
      ...baseHeaders(maxAge),
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}

export function notFound(hint?: string): Response {
  return json({ error: 'not found', ...(hint ? { hint } : {}) }, { status: 404, maxAge: 300 });
}
