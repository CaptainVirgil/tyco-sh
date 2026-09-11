export interface Env {
  /** Static assets bound from ./public. */
  ASSETS: Fetcher;
}

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
