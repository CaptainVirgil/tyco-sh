import { json } from '../respond';
import { liveEnvelope, readSnapshot } from '../snapshot';
import type { Env } from '../types';

/**
 * How much is half-finished.
 *
 * The obvious measure was open issues and pull requests, and it read zero
 * across every repository — so it would have published a confident 0 meaning
 * "nothing to measure", which is the exact failure the rest of this API is
 * careful about. Branches that are not their repository's default actually
 * move, and they are an honest proxy for work started and set down.
 *
 * No repository is ever named. Two integers, and that is the whole answer.
 */
export async function yak(_request: Request, _url: URL, env: Env): Promise<Response> {
  const live = await readSnapshot(env);
  const envelope = liveEnvelope(live);

  const y = live.state === 'dark' ? null : live.snapshot.yak;

  return json(
    {
      ...envelope,
      branches: y?.branches ?? null,
      repos: y?.repos ?? null,
      basis: 'branches that are not their repository default branch',
    },
    { maxAge: live.state === 'dark' ? 0 : 60 },
  );
}
