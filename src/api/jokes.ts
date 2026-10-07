import { json, notFound } from '../respond';

/**
 * It is always DNS.
 *
 * No `as_of`, no confidence, no qualifier, no cleverness. The restraint is the
 * entire joke — resist every future urge to make this endpoint do more.
 */
export function isItDns(): Response {
  return json({ dns: true }, { maxAge: 86400 });
}

/**
 * A route that exists solely to 404. Documented in /api/endpoints so people
 * can find it, which is the only reason it is worth having.
 */
export function itWasNotDns(): Response {
  return notFound('try /api/is-it-dns');
}

/**
 * btw.
 *
 * Deadpan on purpose, and an endpoint rather than a line in the bio: written
 * out in prose it is the most over-used sentence on the internet, but a route
 * that exists solely to answer `true` is the same joke the restraint way, and
 * the same shape as /api/is-it-dns. Do not elaborate on it either.
 */
export function btw(): Response {
  return json({ arch: true }, { maxAge: 86400 });
}

/** RFC 2324 §2.3.2. The correct status code is the whole gag. */
export function coffee(): Response {
  return json(
    { brewing: false, reason: 'I am, per RFC 2324, a teapot' },
    { status: 418, maxAge: 86400 },
  );
}
