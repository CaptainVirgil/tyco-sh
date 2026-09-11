import { json } from '../respond';
import { liveEnvelope, readSnapshot } from '../snapshot';
import type { Env } from '../types';

/**
 * The live projection. One endpoint for now; the individual readings
 * (/api/rack, /api/pz, /api/yak) are the same snapshot sliced differently.
 *
 * When there is no snapshot this returns nulls and says why, rather than
 * zeros. Zero watts is a claim about the rack; null is a claim about the
 * pipeline, and only one of those is true when the house is dark.
 */
export async function snapshot(_request: Request, _url: URL, env: Env): Promise<Response> {
  const live = await readSnapshot(env);
  const envelope = liveEnvelope(live);

  if (live.state === 'dark') {
    return json(
      {
        ...envelope,
        cluster: { nodes: null, nodes_ready: null, containers: null },
        rack: { inlet_c: null, draw_w: null, fans_rpm: null },
        games: { servers: [] },
        yak: { depth: null, deepest_this_month: null },
      },
      { maxAge: 0 },
    );
  }

  const s = live.snapshot;
  return json(
    {
      ...envelope,
      age_s: live.ageS,
      cluster: s.cluster,
      rack: s.rack,
      games: s.games,
      yak: s.yak,
    },
    { maxAge: 30 },
  );
}
