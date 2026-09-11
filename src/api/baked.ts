import blameData from '../../data/blame.json';
import excuseData from '../../data/excuses.json';
import severityData from '../../data/severity.json';
import { json } from '../respond';

/**
 * The endpoints that draw from a curated corpus compiled into the bundle.
 *
 * None of them reads live telemetry, so all of them answer when the house is
 * dark — and none of them queries the incident register at the edge, because
 * that register describes a private estate. The corpora are hand-extracted,
 * coordinate-free, and reviewable in a diff.
 */

/** Uncached: every call should land somewhere different. */
const NO_STORE = 0;

export function oncall(): Response {
  return json(
    {
      engineer: 'virgil',
      rotation: 'perpetual',
      bus_factor: 1,
      escalation_path: null,
    },
    { maxAge: 86400 },
  );
}

/**
 * Weighted by how often each component actually turned out to be at fault.
 * `basis` is what separates this from a random word generator — and it is why
 * the counts have to stay honest.
 */
export function blame(): Response {
  const { components, total } = blameData;

  let roll = Math.random() * total;
  let picked = components[components.length - 1]!;
  for (const c of components) {
    roll -= c.count;
    if (roll <= 0) {
      picked = c;
      break;
    }
  }

  const share = picked.count / total;
  return json(
    {
      blame: picked.name,
      confidence: Number(share.toFixed(3)),
      basis: `${Math.round(share * 100)}% of resolved incidents, n=${total}`,
      appeal: '/api/is-it-dns',
    },
    { maxAge: NO_STORE },
  );
}

export function excuse(): Response {
  const list = excuseData.excuses;
  const picked = list[Math.floor(Math.random() * list.length)]!;
  return json(picked, { maxAge: NO_STORE });
}

export function severity(): Response {
  const list = severityData.levels;
  const picked = list[Math.floor(Math.random() * list.length)]!;
  return json(picked, { maxAge: NO_STORE });
}
