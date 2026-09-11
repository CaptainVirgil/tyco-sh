import { ingest } from './api/ingest';
import { isTerminal } from './negotiate';
import { notFound } from './respond';
import { rootText } from './root';
import { lookup } from './routes';
import type { Env } from './types';

/** The one path that is not a GET. Deliberately outside /api — it is plumbing, not API. */
const INGEST_PATH = '/_ingest';

/**
 * Hostnames that are this site by another name. Kept in code rather than as a
 * dashboard redirect rule so the behaviour is reviewable in a diff — and so
 * nobody has to remember it exists.
 *
 * Only the apex and www: tycostation.com has live subdomains (mail, vpn and
 * others) that must keep resolving to their own hosts.
 */
const ALIASES = new Set(['tycostation.com', 'www.tycostation.com', 'www.tyco.sh']);

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (ALIASES.has(url.hostname)) {
      // 301: these are not separate resources and never will be. Path and
      // query carry over so a deep link does not land on the front page.
      return Response.redirect(`https://tyco.sh${url.pathname}${url.search}`, 301);
    }

    // Handled before the method guard, because it is the only writer.
    if (url.pathname === INGEST_PATH) {
      return ingest(request, env);
    }

    // Everything else is a GET. No POSTs, no auth, no user input anywhere —
    // which is most of the security posture, not an oversight.
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('method not allowed\n', {
        status: 405,
        headers: { Allow: 'GET, HEAD', 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }

    if (url.pathname === '/' || url.pathname === '') {
      return isTerminal(request) ? rootText(env) : env.ASSETS.fetch(request);
    }

    const route = lookup(url.pathname);
    if (route) return route.handler(request, url, env);

    // Not a route: anything under /api that got this far is a real miss and
    // should say so in JSON rather than handing back the 404 page.
    if (url.pathname.startsWith('/api/')) {
      return notFound('try /api/endpoints');
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
