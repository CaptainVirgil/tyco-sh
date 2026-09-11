/**
 * resume.json -> public/resume.pdf
 *
 * pdfkit is a devDependency and runs only here, at build time. Nothing in this
 * file reaches the edge; the Worker serves the finished bytes as a static asset.
 *
 * The layout deliberately matches the site rather than a Word template: a warm
 * off-white ground, one rust accent, a monospace-feeling name, and generous
 * rules instead of boxes. It is the same document as the page and the plaintext
 * form, so it should not look like it came from somewhere else.
 */

import PDFDocument from 'pdfkit';
import { createWriteStream } from 'node:fs';

const INK = '#1b1a18';
const DIM = '#55514b';
const FAINT = '#8a857c';
const ACCENT = '#9a5b2c';
const RULE = '#ddd8ce';

const PAGE = { size: 'LETTER', margins: { top: 44, bottom: 38, left: 52, right: 52 } };

export function renderPdf(resume, outPath) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      ...PAGE,
      info: {
        Title: `${resume.basics.name} — ${resume.basics.label}`,
        Author: resume.basics.name,
        Subject: 'Résumé',
        Keywords: (resume.skills ?? []).map((s) => s.name).join(', '),
        // Pinned to the document's own date rather than the clock, so two
        // builds of the same résumé produce the same file.
        CreationDate: new Date(`${resume.meta.lastModified}T00:00:00Z`),
      },
    });

    const stream = createWriteStream(outPath);
    stream.on('finish', resolve);
    stream.on('error', reject);
    doc.pipe(stream);

    header(doc, resume);
    summary(doc, resume);
    experience(doc, resume);
    projects(doc, resume);
    certificates(doc, resume);
    skills(doc, resume);
    footer(doc, resume);

    doc.end();
  });
}

function header(doc, r) {
  const b = r.basics;

  doc.fillColor(INK).font('Courier-Bold').fontSize(21).text(b.name);
  doc.moveDown(0.22);
  doc.fillColor(ACCENT).font('Helvetica').fontSize(11).text(b.label);
  doc.moveDown(0.5);

  doc
    .fillColor(DIM)
    .font('Helvetica')
    .fontSize(8.5)
    .text(`${b.location.city}, ${b.location.region}   ·   ${b.email}`);
  doc
    .fillColor(FAINT)
    .fontSize(8.5)
    .text((b.profiles ?? []).map((p) => p.url.replace(/^https?:\/\//, '')).join('   ·   '));

  rule(doc, 10);
}

function summary(doc, r) {
  doc
    .fillColor(DIM)
    .font('Helvetica')
    .fontSize(9)
    .text(r.basics.summary, { align: 'left', lineGap: 1 });
  doc.moveDown(0.4);
}

function experience(doc, r) {
  if (!r.work?.length) return;
  heading(doc, 'Experience');

  for (const w of r.work) {
    // Keep a role's title with at least its first bullet. A heading stranded
    // at the foot of a page is the one layout bug people actually notice.
    keepTogether(doc, 62);

    doc.fillColor(INK).font('Helvetica-Bold').fontSize(10).text(w.position);
    doc
      .fillColor(FAINT)
      .font('Helvetica')
      .fontSize(8.5)
      .text(`${w.name} · ${w.location} · ${span(w)}`);
    doc.moveDown(0.3);

    if (w.highlights?.length) {
      // doc.list rather than hand-placed glyphs: positioning a bullet at an
      // absolute y that has already passed the page bottom strands the dot on
      // a page of its own, which is exactly what happened here.
      doc
        .fillColor(DIM)
        .font('Helvetica')
        .fontSize(8.7)
        .list(w.highlights, { bulletRadius: 1.1, textIndent: 9, bulletIndent: 2, lineGap: 0.8 });
    }
    doc.moveDown(0.36);
  }
}

function projects(doc, r) {
  if (!r.projects?.length) return;
  heading(doc, 'Projects');

  for (const p of r.projects) {
    keepTogether(doc, 46);
    const short = p.url?.replace(/^https?:\/\//, '');
    const showUrl = !!short && short !== p.name;
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(9.5).text(p.name, { continued: showUrl });
    if (showUrl) {
      doc.fillColor(FAINT).font('Helvetica').fontSize(8.5).text(`   ${short}`);
    }
    doc.fillColor(DIM).font('Helvetica').fontSize(8.5).text(p.description, { lineGap: 0.8 });
    doc.fillColor(FAINT).font('Helvetica-Oblique').fontSize(8).text(p.keywords.join(' · '));
    doc.moveDown(0.26);
  }
}

function skills(doc, r) {
  if (!r.skills?.length) return;
  heading(doc, 'Skills');

  for (const s of r.skills) {
    keepTogether(doc, 22);
    doc
      .fillColor(INK)
      .font('Helvetica-Bold')
      .fontSize(8.2)
      .text(`${s.name}: `, { continued: true })
      .fillColor(DIM)
      .font('Helvetica')
      .text(s.keywords.join(', '), { lineGap: 0.5 });
    doc.moveDown(0.13);
  }
}

function certificates(doc, r) {
  if (!r.certificates?.length) return;
  heading(doc, 'Certifications');
  doc
    .fillColor(DIM)
    .font('Helvetica')
    .fontSize(8.2)
    .text(r.certificates.map((c) => c.name).join('   ·   '), { lineGap: 0.6 });
  doc.moveDown(0.4);
}

function footer(doc, r) {
  rule(doc, 6);
  doc
    .fillColor(FAINT)
    .font('Helvetica')
    .fontSize(7.5)
    .text(`${r.meta.canonical}  ·  v${r.meta.version}  ·  ${r.meta.lastModified}`);
}

// -- primitives ------------------------------------------------------------

function heading(doc, label) {
  doc.moveDown(0.28);
  keepTogether(doc, 40);
  doc
    .fillColor(FAINT)
    .font('Helvetica-Bold')
    .fontSize(7.5)
    .text(label.toUpperCase(), { characterSpacing: 1.4 });
  doc.moveDown(0.3);
}

function rule(doc, gap) {
  doc.moveDown(gap / 14);
  const y = doc.y;
  doc
    .strokeColor(RULE)
    .lineWidth(0.6)
    .moveTo(doc.page.margins.left, y)
    .lineTo(doc.page.width - doc.page.margins.right, y)
    .stroke();
  doc.moveDown(0.62);
}

/** Break to a new page rather than orphan a heading at the foot of this one. */
function keepTogether(doc, needed) {
  const bottom = doc.page.height - doc.page.margins.bottom;
  if (doc.y + needed > bottom) doc.addPage();
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
