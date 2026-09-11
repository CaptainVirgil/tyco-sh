import { ASCII, CAPABILITIES, IDENTITY } from '../data/copy';
import { text } from './respond';

/**
 * What a terminal gets at `/`.
 *
 * Live numbers land here in M3. Until then this states only things that are
 * true without asking the house anything — an em-dash where a number will go
 * is honest; a zero would not be.
 */
export function rootText(): Response {
  const lines: string[] = [];

  lines.push('  ' + ASCII);
  lines.push(`  ${IDENTITY.name.toLowerCase()} · infrastructure · indiana`);
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

  return text(lines.join('\n'));
}
