import { isTerminal } from './negotiate';
import { notFound } from './respond';
import { rootText } from './root';
import { lookup } from './routes';
import type { Env } from './types';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Everything here is a GET. No POSTs, no auth, no user input anywhere —
    // which is most of the security posture, not an oversight.
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('method not allowed\n', {
        status: 405,
        headers: { Allow: 'GET, HEAD', 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }

    if (url.pathname === '/' || url.pathname === '') {
      return isTerminal(request) ? rootText() : env.ASSETS.fetch(request);
    }

    const route = lookup(url.pathname);
    if (route) return route.handler(request, url, env);

    // Not a route: let the asset server try, and only then give up. Anything
    // under /api that got this far is a real miss and should say so in JSON
    // rather than handing back the 404 page.
    if (url.pathname.startsWith('/api/')) {
      return notFound('try /api/endpoints');
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
