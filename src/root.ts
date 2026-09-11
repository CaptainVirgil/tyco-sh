import { ASCII, CAPABILITIES, IDENTITY } from '../data/copy';
import { text } from './respond';
import { readSnapshot } from './snapshot';
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
    const up = s.games.servers.filter((g) => g.up === true).length;

    lines.push(`  ${'cluster'.padEnd(11)}${nodes === null ? '—' : `${nodes} nodes`}`);
    lines.push(
      `  ${'rack'.padEnd(11)}${inlet === null ? '—' : `${inlet}°C`}, ${draw === null ? '—' : `${draw}W`}`,
    );
    lines.push(`  ${'games'.padEnd(11)}${up} of ${s.games.servers.length} up`);
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
