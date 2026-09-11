#!/usr/bin/env node
/**
 * resume.json -> public/resume.txt (and, later, public/resume.pdf).
 *
 * The failure mode this guards against is a PDF that drifted from the JSON —
 * someone edits one and ships the other, and the two disagree in front of a
 * stranger. Both derive from the same file, and `meta.version` is stamped into
 * every output so a test can prove they came from the same source.
 *
 * It also refuses to build while the placeholder work history is still in
 * place, so an unfinished résumé cannot reach the edge by accident.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

const resume = JSON.parse(await readFile(join(root, 'data/resume.json'), 'utf8'));

const todos = findTodos(resume);
if (todos.length) {
  console.error('resume.json still has placeholders:\n');
  for (const path of todos) console.error(`  ${path}`);
  console.error('\nFill them in, or run with --force to build anyway (the output will say so).');
  if (!process.argv.includes('--force')) process.exit(1);
}

await writeFile(join(root, 'public/resume.txt'), plaintext(resume), 'utf8');
console.log(`wrote public/resume.txt (version ${resume.meta.version})`);

/** Walks the whole document so a TODO cannot hide in a nested array. */
function findTodos(node, path = '') {
  const out = [];
  if (typeof node === 'string') {
    if (node.includes('TODO')) out.push(path || '(root)');
    return out;
  }
  if (Array.isArray(node)) {
    node.forEach((v, i) => out.push(...findTodos(v, `${path}[${i}]`)));
    return out;
  }
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      out.push(...findTodos(v, path ? `${path}.${k}` : k));
    }
  }
  return out;
}

function plaintext(r) {
  const b = r.basics;
  const lines = [
    b.name,
    b.label,
    `${b.location.city}, ${b.location.region}`,
    b.email,
    // One per line: joined, these run past 80 columns, and the whole point of
    // the plaintext form is that it fits a terminal.
    ...(r.basics.profiles || []).map((p) => p.url.replace(/^https?:\/\//, '')),
    '',
    wrap(b.summary, 78),
    '',
  ];

  if (r.work?.length) {
    lines.push('EXPERIENCE');
    for (const w of r.work) {
      lines.push('');
      lines.push(`  ${w.position}`);
      lines.push(`  ${w.name} — ${w.location} · ${span(w)}`);
      for (const h of w.highlights || []) {
        lines.push(bullet(h, 72, '    '));
      }
    }
    lines.push('');
  }

  if (r.projects?.length) {
    lines.push('PROJECTS');
    for (const p of r.projects) {
      lines.push('');
      lines.push(`  ${p.name} — ${p.keywords.join(', ')}`);
      lines.push(wrap(p.description, 74, '  '));
    }
    lines.push('');
  }

  if (r.skills?.length) {
    lines.push('SKILLS');
    for (const s of r.skills) {
      lines.push('');
      lines.push(wrap(`${s.name}: ${s.keywords.join(', ')}`, 74, '  '));
    }
    lines.push('');
  }

  if (r.certificates?.length) {
    lines.push('CERTIFICATIONS');
    for (const c of r.certificates) lines.push(`  ${c.name}`);
    lines.push('');
  }

  lines.push(`-- ${r.meta.note}`, `-- version ${r.meta.version}`);
  return lines.join('\n') + '\n';
}

/** "Dec 2025 – present" from JSON Resume's YYYY-MM (or bare YYYY) dates. */
function span(w) {
  const fmt = (d) => {
    if (!d) return null;
    const [y, m] = d.split('-');
    if (!m) return y;
    const months = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ');
    return `${months[Number(m) - 1]} ${y}`;
  };
  return `${fmt(w.startDate)} – ${fmt(w.endDate) ?? 'present'}`;
}

function bullet(text, width, indent) {
  const wrapped = wrap(text, width, indent).split('\n');
  wrapped[0] = indent.slice(2) + '- ' + wrapped[0].slice(indent.length);
  return wrapped.join('\n');
}

function wrap(s, width, indent = '') {
  const words = s.split(/\s+/);
  const lines = [];
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
