import { defineConfig } from 'vitest/config';
import { cloudflareTest } from '@cloudflare/vitest-pool-workers';

// vitest-pool-workers 0.22 dropped `defineWorkersConfig` and the `./config`
// subpath in favour of a plain Vite plugin. Tests run inside workerd, against
// the same wrangler.jsonc the deploy uses, so bindings behave as they will live.
export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      miniflare: {
        // The real secret is set with `wrangler secret put` and lives nowhere
        // in this repo. Tests need *a* value to exercise the auth path.
        bindings: { INGEST_TOKEN: 'test-token-not-a-real-one' },
      },
    }),
  ],
});
