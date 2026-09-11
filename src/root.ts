import { ASCII, CAPABILITIES, IDENTITY } from '../data/copy';
import { text } from './respond';
import { readSnapshot, type GameServer } from './snapshot';
import type { Env } from './types';

/**
 * What a terminal gets at `/`.
 *
 * When the snapshot is missing or aged out the numbers are dashes and a line
 * says the house may be dark. It never prints a stale number as a fresh one,
 * and never prints a zero where it means "we could not read this".
 */
export async function rootText(env: Env): Promise<Response> {
  const live = await readSnapshot(env);
  const lines: string[] = [];

  lines.push('  ' + ASCII);
  lines.push(`  ${IDENTITY.name.toLowerCase()} · infrastructure · indiana`);
  lines.push('');

  if (live.state === 'dark') {
    lines.push(`  ${'cluster'.padEnd(11)}—`);
    lines.push(`  ${'rack'.padEnd(11)}—`);
    lines.push(`  ${'oncall'.padEnd(11)}virgil (perpetual, bus factor 1)`);
    lines.push(`  ${'dns'.padEnd(11)}suspect`);
    lines.push('');
    lines.push(`  ${live.reason}`);
  } else {
    const s = live.snapshot;
    const nodes = s.cluster.nodes;
    const inlet = s.rack.inlet_c;
    const draw = s.rack.draw_w;

    lines.push(`  ${'cluster'.padEnd(11)}${nodes === null ? '—' : `${nodes} nodes`}`);

    // One dash when the BMC said nothing at all, rather than "—, —".
    const rackParts: string[] = [];
    if (inlet !== null) rackParts.push(`${inlet}°C`);
    if (draw !== null) rackParts.push(`${draw}W`);
    lines.push(`  ${'rack'.padEnd(11)}${rackParts.length ? rackParts.join(', ') : '—'}`);

    lines.push(`  ${'servers'.padEnd(11)}${serverLine(s.games.servers)}`);
    lines.push(`  ${'oncall'.padEnd(11)}virgil (perpetual, bus factor 1)`);
    lines.push(`  ${'dns'.padEnd(11)}suspect`);
    if (live.state === 'stale') {
      lines.push('');
      lines.push(`  these numbers are ${Math.round(live.ageS / 60)} minutes old.`);
    }
  }

  lines.push('');
  for (const c of CAPABILITIES) {
    lines.push(`  ${c.group.padEnd(11)}${c.detail}`);
  }
  lines.push('');

  lines.push('  curl tyco.sh/api/hire | jq      the résumé, as JSON Resume');
  lines.push('  curl tyco.sh/api/endpoints      everything else');
  lines.push('  curl tyco.sh/api/is-it-dns      it is');
  lines.push('');
  lines.push('  a browser renders this more nicely, but not more honestly.');

  return text(lines.join('\n'), { maxAge: 0 });
}

/**
 * "0 of 5 up" is a lie when four of the five have no liveness source: it reads
 * as five servers down. Only the surveyable ones are counted, and the rest are
 * named as unknown — a server nobody can survey is not a server that is down.
 */
function serverLine(servers: GameServer[]): string {
  const surveyable = servers.filter((g) => g.up !== null);
  const unknown = servers.length - surveyable.length;
  const up = surveyable.filter((g) => g.up === true).length;

  if (surveyable.length === 0) return `— (${servers.length} unknown)`;

  const head = `${up} of ${surveyable.length} up`;
  return unknown ? `${head}, ${unknown} unknown` : head;
}
