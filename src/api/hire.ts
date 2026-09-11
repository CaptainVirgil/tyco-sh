import resume from '../../data/resume.json';
import { prefers } from '../negotiate';
import { json, text } from '../respond';

/**
 * The one endpoint that must answer with the rack unplugged, the cluster down
 * and KV empty. It reads a file compiled into this bundle and touches nothing
 * else — no binding, no fetch, no snapshot. Keep it that way.
 *
 * It is JSON Resume rather than a shape of our own so that
 * `curl -s tyco.sh/api/hire | jq '.work[0]'` works without reading any docs,
 * and so the page, the plaintext and the PDF all derive from one file.
 */
export function hire(request: Request, url: URL): Response {
  const wantsPdf = prefers(request, 'application/pdf') > prefers(request, 'application/json');
  if (wantsPdf) {
    return Response.redirect(new URL('/resume.pdf', url).toString(), 302);
  }

  // A browser that followed a link here wants the page, not a wall of JSON.
  const wantsHtml =
    prefers(request, 'text/html') > prefers(request, 'application/json') &&
    prefers(request, 'text/html') > prefers(request, 'text/plain');
  if (wantsHtml) {
    return Response.redirect(new URL('/#work', url).toString(), 302);
  }

  if (prefers(request, 'text/plain') > prefers(request, 'application/json')) {
    return text(plaintext(), { maxAge: 3600 });
  }

  return json(resume, { maxAge: 3600 });
}

/** 80 columns, because the thing asking for text/plain is a terminal. */
function plaintext(): string {
  const b = resume.basics;
  const out: string[] = [];

  out.push(b.name);
  out.push(b.label);
  out.push(`${b.location.city}, ${b.location.region}`);
  out.push(b.email);
  out.push('');
  out.push(wrap(b.summary, 78));
  out.push('');

  if (resume.projects.length) {
    out.push('PROJECTS');
    for (const p of resume.projects) {
      out.push('');
      out.push(`  ${p.name} — ${p.keywords.join(', ')}`);
      out.push(wrap(p.description, 74, '  '));
    }
    out.push('');
  }

  if (resume.skills.length) {
    out.push('SKILLS');
    for (const s of resume.skills) {
      out.push(wrap(`${s.name}: ${s.keywords.join(', ')}`, 74, '  '));
    }
    out.push('');
  }

  out.push(`-- ${resume.meta.note}`);
  return out.join('\n');
}

function wrap(s: string, width: number, indent = ''): string {
  const words = s.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    if (line && line.length + 1 + w.length > width) {
      lines.push(indent + line);
      line = w;
    } else {
      line = line ? `${line} ${w}` : w;
    }
  }
  if (line) lines.push(indent + line);
  return lines.join('\n');
}
