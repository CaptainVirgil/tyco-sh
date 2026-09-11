import { json } from '../respond';
import { liveEnvelope, readSnapshot, type GameServer } from '../snapshot';
import type { Env } from '../types';

/**
 * The individual live readings. Each is the same snapshot sliced differently,
 * so they agree with /api/snapshot and with each other by construction.
 *
 * /api/rack is deliberately the least funny thing here. After nine jokes, a
 * real sensor reading off a real BMC is the one that says the rest was true.
 */

export async function rack(_request: Request, _url: URL, env: Env): Promise<Response> {
  const live = await readSnapshot(env);
  const envelope = liveEnvelope(live);

  if (live.state === 'dark') {
    return json(
      { ...envelope, inlet_c: null, draw_w: null, fans_rpm: null, chassis: null },
      { maxAge: 0 },
    );
  }

  const r = live.snapshot.rack;
  return json(
    {
      ...envelope,
      inlet_c: r.inlet_c,
      draw_w: r.draw_w,
      fans_rpm: r.fans_rpm,
      chassis: r.chassis,
    },
    { maxAge: 30 },
  );
}

/**
 * Project Zomboid is the only server with a liveness source, which is why it
 * gets an endpoint of its own. Address and port are not part of the answer and
 * never will be.
 */
export async function pz(_request: Request, _url: URL, env: Env): Promise<Response> {
  const live = await readSnapshot(env);
  const envelope = liveEnvelope(live);

  const server =
    live.state === 'dark'
      ? undefined
      : live.snapshot.games.servers.find((g) => g.alias === 'project zomboid');

  if (!server) {
    return json(
      { ...envelope, server: 'project zomboid', up: null, players: null, max: null },
      { maxAge: 0 },
    );
  }

  return json(
    { ...envelope, server: server.alias, up: server.up, players: server.players, max: server.max },
    { maxAge: 30 },
  );
}

/**
 * Every game server, with the counts stated in a way that cannot be misread.
 *
 * `up` is how many are actually up; `surveyable` is the only honest denominator,
 * because four of the five have no liveness source at all. Reporting "0 of 5"
 * would claim five servers are down when the truth is that one is down and four
 * are unknown.
 */
export async function games(_request: Request, _url: URL, env: Env): Promise<Response> {
  const live = await readSnapshot(env);
  const envelope = liveEnvelope(live);

  const servers: GameServer[] = live.state === 'dark' ? [] : live.snapshot.games.servers;
  const surveyable = servers.filter((g) => g.up !== null);

  return json(
    {
      ...envelope,
      total: servers.length,
      surveyable: surveyable.length,
      unknown: servers.length - surveyable.length,
      up: surveyable.filter((g) => g.up === true).length,
      players: surveyable.reduce((n, g) => n + (g.players ?? 0), 0),
      servers,
    },
    { maxAge: live.state === 'dark' ? 0 : 30 },
  );
}
