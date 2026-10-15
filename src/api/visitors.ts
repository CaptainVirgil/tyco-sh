import { json } from '../respond';
import { readTraffic, summarize } from '../traffic';
import type { Env } from '../types';

/**
 * Visitors per day, requests served, countries, and two counters that are only
 * here because they are funny. Cloudflare counted all of it; see src/traffic.ts
 * for what is deliberately left out.
 */
export async function visitors(_request: Request, _url: URL, env: Env): Promise<Response> {
  return json(summarize(await readTraffic(env), Date.now()), { maxAge: 300 });
}
