import { readAvail, summarize } from '../availability';
import { json } from '../respond';
import type { Env } from '../types';

/**
 * Service availability, not host uptime.
 *
 * "up 400 days" advertises a kernel nobody has patched. Availability measured
 * from outside the network is both the harder number to produce and the one
 * worth showing, and `window_days` says plainly how much history stands behind
 * it — a twelve-day number labelled twelve days is honest; the same number
 * labelled ninety is the defect this whole site is built against.
 */
export async function uptime(_request: Request, _url: URL, env: Env): Promise<Response> {
  const avail = await readAvail(env);
  const summary = summarize(avail, Date.now());

  return json(summary, { maxAge: 60 });
}
