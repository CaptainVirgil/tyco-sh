import type { Route } from './types';
import { blame, excuse, oncall, severity } from './api/baked';
import { hire } from './api/hire';
import { coffee, isItDns, itWasNotDns } from './api/jokes';
import { json } from './respond';

/**
 * One table. The router dispatches from it and /api/endpoints renders from it,
 * so a route cannot exist undocumented and a documented route cannot 404.
 * Order here is the order /api/endpoints prints — the straight-faced ones last.
 */
export const ROUTES: Route[] = [
  {
    path: '/api/endpoints',
    describe: 'this list',
    live: false,
    handler: () => endpoints(),
  },
  {
    path: '/api/hire',
    describe: 'a résumé, as JSON Resume — add Accept: text/plain or application/pdf',
    live: false,
    handler: hire,
  },
  {
    path: '/api/is-it-dns',
    describe: 'it is',
    live: false,
    handler: isItDns,
  },
  {
    path: '/api/it-was-not-dns',
    describe: 'returns 404, which is the answer',
    live: false,
    handler: itWasNotDns,
  },
  {
    path: '/api/coffee',
    describe: 'returns 418',
    live: false,
    handler: coffee,
  },
  {
    path: '/api/oncall',
    describe: 'who is on call',
    live: false,
    handler: oncall,
  },
  {
    path: '/api/blame',
    describe: 'a component, weighted by how often it actually was the component',
    live: false,
    handler: blame,
  },
  {
    path: '/api/excuse',
    describe: 'a real failure, with its coordinates removed',
    live: false,
    handler: excuse,
  },
  {
    path: '/api/severity',
    describe: 'a severity, and the first thing you would actually do',
    live: false,
    handler: severity,
  },
];

function endpoints(): Response {
  return json(
    {
      endpoints: ROUTES.filter((r) => !r.hidden).map((r) => ({
        path: r.path,
        describe: r.describe,
        live: r.live,
      })),
      note: 'live endpoints carry as_of and stale; the rest answer even when the house is dark',
    },
    { maxAge: 300 },
  );
}

export function lookup(pathname: string): Route | undefined {
  // Trailing slashes are a typo, not a different resource.
  const clean = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return ROUTES.find((r) => r.path === clean);
}
