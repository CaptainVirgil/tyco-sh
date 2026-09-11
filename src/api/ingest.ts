import { KNOWN_CONTRACTS } from '../contract';
import { KV_KEY, TTL_S, type Snapshot } from '../snapshot';
import type { Env } from '../types';

/** 16 KB. The snapshot is a few hundred bytes; anything near this is not ours. */
const MAX_BODY = 16 * 1024;

/** How far out of step a clock may be before the push is refused. */
const MAX_SKEW_S = 300;

/**
 * The only write path in the whole site, and the only thing that is not a GET.
 *
 * It accepts a snapshot from the emitter inside the LAN. Everything about it
 * is refusal-first: wrong token, oversized body, unknown contract, or a
 * timestamp from the future or the distant past all get turned away before
 * anything is stored. A bad write here would not crash the site, it would make
 * it confidently wrong, which is worse.
 */
export async function ingest(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'PUT') {
    return refuse(405, 'method not allowed');
  }

  const expected = env.INGEST_TOKEN;
  if (!expected) {
    // Fail closed. An unset secret must never mean "anyone may write".
    return refuse(503, 'ingest is not configured');
  }

  const offered = bearer(request.headers.get('Authorization'));
  if (!offered || !timingSafeEqual(offered, expected)) {
    return refuse(401, 'unauthorized');
  }

  const declared = Number(request.headers.get('Content-Length') ?? '0');
  if (declared > MAX_BODY) return refuse(413, 'body too large');

  const body = await request.text();
  if (body.length > MAX_BODY) return refuse(413, 'body too large');

  let snapshot: Snapshot;
  try {
    snapshot = JSON.parse(body) as Snapshot;
  } catch {
    return refuse(400, 'body did not parse');
  }

  if (!KNOWN_CONTRACTS.includes(snapshot?.contract)) {
    return refuse(409, 'unknown contract');
  }

  const at = Date.parse(snapshot?.as_of ?? '');
  if (Number.isNaN(at)) return refuse(400, 'as_of is not a timestamp');

  const skewS = (Date.now() - at) / 1000;
  if (skewS < -MAX_SKEW_S) return refuse(400, 'as_of is in the future');
  if (skewS > MAX_SKEW_S) return refuse(400, 'as_of is too old to be a push');

  await env.SNAPSHOT.put(KV_KEY, body, { expirationTtl: TTL_S });

  return new Response(JSON.stringify({ stored: true, ttl_s: TTL_S }) + '\n', {
    status: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function refuse(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }) + '\n', {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function bearer(header: string | null): string | null {
  if (!header) return null;
  const [scheme, ...rest] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer') return null;
  const value = rest.join(' ').trim();
  return value.length ? value : null;
}

/**
 * Constant-time within a length class. The early length return leaks only the
 * token's length, which an attacker who can count bytes already knows.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
