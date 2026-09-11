import resume from '../../data/resume.json';
import { prefers } from '../negotiate';
import { json } from '../respond';
import type { Env } from '../types';

/**
 * The one endpoint that must answer with the rack unplugged, the cluster down
 * and KV empty. It reads a file compiled into this bundle and an asset served
 * beside it — no binding to the snapshot store, no fetch to anything outside.
 * Keep it that way.
 *
 * It is JSON Resume rather than a shape of our own so that
 * `curl -s tyco.sh/api/hire | jq '.work[0]'` works without reading any docs.
 *
 * The plaintext form is the built `resume.txt` asset rather than a second
 * formatter living here. Two formatters would drift, and the whole point of
 * one source file is that the JSON, the text and the PDF cannot disagree.
 */
export async function hire(request: Request, url: URL, env: Env): Promise<Response> {
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
    const res = await env.ASSETS.fetch(new URL('/resume.txt', url));
    if (res.ok) {
      return new Response(res.body, {
        status: 200,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'public, max-age=3600',
        },
      });
    }
    // The asset is missing — fall through to JSON rather than 500. Something
    // is better than nothing from the one endpoint that must always answer.
  }

  return json(resume, { maxAge: 3600 });
}
