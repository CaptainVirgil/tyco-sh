import { KNOWN_CONTRACTS } from './contract';
import type { Env } from './types';

/**
 * The live snapshot: what the emitter inside the LAN pushes out, and the only
 * live data this site has.
 *
 * Every measured field is `number | null` rather than `number`. That is not
 * defensive typing, it is the whole point: a source that could not be read is
 * a different fact from a source that read zero, and rendering them the same
 * way is the defect this household keeps paying for. `null` means "we do not
 * know", and the page renders it as a dash.
 */
export interface Snapshot {
  contract: number;
  /** RFC 3339, UTC, stamped by the emitter at projection time. */
  as_of: string;
  cluster: {
    nodes: number | null;
    nodes_ready: number | null;
    containers: number | null;
  };
  rack: {
    inlet_c: number | null;
    draw_w: number | null;
    fans_rpm: number[] | null;
    chassis: string;
  };
  games: {
    servers: GameServer[];
  };
  yak: {
    depth: number | null;
    deepest_this_month: number | null;
  };
}

export interface GameServer {
  alias: string;
  /** null when the server cannot be surveyed at all, which is not the same as down. */
  up: boolean | null;
  players: number | null;
  max: number | null;
}

export const KV_KEY = 'snapshot';

/**
 * Cadence and the two windows that follow from it.
 *
 * The emitter pushes every 5 minutes. That is slower than the page needs and
 * deliberately so: KV's free allowance is on the order of a thousand writes a
 * day, one push every thirty seconds would be nearly three thousand, and the
 * dead-man worker on this account is already spending part of that budget.
 * Rack temperature does not move fast enough for the difference to show.
 */
export const CADENCE_S = 300;

/** Two missed pushes. Below this the numbers are simply current. */
export const FRESH_S = CADENCE_S * 2;

/**
 * Six missed pushes, and the KV TTL. Past this the key is gone — which is the
 * honesty mechanism: with nothing stored, the edge cannot serve a month-old
 * number even by accident, because there is no number to serve.
 */
export const TTL_S = CADENCE_S * 6;

export type Liveness =
  | { state: 'live'; snapshot: Snapshot; ageS: number }
  | { state: 'stale'; snapshot: Snapshot; ageS: number }
  | { state: 'dark'; reason: string };

export async function readSnapshot(env: Env, now: Date = new Date()): Promise<Liveness> {
  let raw: string | null;
  try {
    raw = await env.SNAPSHOT.get(KV_KEY, 'text');
  } catch {
    return { state: 'dark', reason: 'the snapshot store did not answer' };
  }

  if (raw === null) return { state: 'dark', reason: 'no snapshot — the house may be dark' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { state: 'dark', reason: 'the stored snapshot did not parse' };
  }

  const snapshot = parsed as Snapshot;

  // A contract this Worker does not know means the two halves shipped out of
  // step. Reading fields at the wrong offsets and presenting the result
  // confidently is worse than admitting there is nothing to show.
  if (!KNOWN_CONTRACTS.includes(snapshot?.contract)) {
    return { state: 'dark', reason: 'the snapshot speaks a contract this edge does not' };
  }

  const at = Date.parse(snapshot.as_of);
  if (Number.isNaN(at)) return { state: 'dark', reason: 'the snapshot has no readable timestamp' };

  const ageS = Math.max(0, Math.round((now.getTime() - at) / 1000));

  // Belt and braces. The TTL should already have removed anything this old,
  // but a stored value outliving its own window must never render as current.
  if (ageS > TTL_S) return { state: 'dark', reason: 'the last snapshot aged out' };

  return { state: ageS > FRESH_S ? 'stale' : 'live', snapshot, ageS };
}

/** The envelope every live-backed endpoint carries. */
export function liveEnvelope(l: Liveness): { as_of: string | null; stale: boolean; note?: string } {
  if (l.state === 'dark') return { as_of: null, stale: true, note: l.reason };
  return { as_of: l.snapshot.as_of, stale: l.state === 'stale' };
}
