/**
 * Bindings.
 *
 * `Cloudflare.Env` is generated from wrangler.jsonc by `npm run types`, so the
 * binding list cannot drift from the deploy config — add a binding there and
 * the types follow. Secrets are the exception: they are deliberately absent
 * from wrangler.jsonc (they live in `wrangler secret put`, never in git), so
 * they are declared here by hand.
 */
declare global {
  namespace Cloudflare {
    interface Env {
      /** Shared secret for PUT /_ingest. Unset means ingest fails closed. */
      INGEST_TOKEN?: string;
    }
  }
}

export type Env = Cloudflare.Env;

export type Handler = (request: Request, url: URL, env: Env) => Response | Promise<Response>;

export interface Route {
  path: string;
  /** One line, shown by /api/endpoints. Lowercase, no trailing period. */
  describe: string;
  /** Whether this endpoint reads live telemetry. Baked endpoints answer when the house is dark. */
  live: boolean;
  handler: Handler;
  /** Kept out of /api/endpoints — internal plumbing, not part of the public API. */
  hidden?: boolean;
}
