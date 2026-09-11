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

/** RFC 2324 §2.3.2. The correct status code is the whole gag. */
export function coffee(): Response {
  return json(
    { brewing: false, reason: 'I am, per RFC 2324, a teapot' },
    { status: 418, maxAge: 86400 },
  );
}
