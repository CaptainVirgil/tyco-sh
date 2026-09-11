# tyco.sh

My homepage, and a small JSON API attached to it.

The API is mostly jokes, but the numbers behind the jokes are real — they come
from the rack in my office. Nothing public reaches that network: a process
inside it pushes a snapshot out to the edge every five minutes, and this Worker
serves whatever arrived last. If the house goes dark the snapshot expires and
the site says so, rather than showing you a stale number or a zero.

```
curl tyco.sh                    the page, for terminals
curl tyco.sh/api/hire | jq      a résumé, as JSON Resume
curl tyco.sh/api/endpoints      everything else
curl tyco.sh/api/is-it-dns      it is
```

## How it fits together

```
  inside the network                          Cloudflare edge
  ┌────────────────────────┐                 ┌──────────────────────┐
  │ metrics · BMC · game   │                 │  Worker (this repo)  │
  │ server query port      │                 │   ├── static page    │
  │          │             │  PUT /_ingest   │   ├── baked data     │
  │          ▼             │ ───────────────▶│   └── KV: snapshot   │
  │  whitelist projection  │   every 5 min   │                      │
  └────────────────────────┘                 └──────────▲───────────┘
                                                        │
                                                 the public internet
```

The emitter lives in a private repo. It reads the sources, narrows everything
through a projection whose field list is enforced by tests, and PUTs the result
outward. There is no inbound path into the network at all — this Worker cannot
reach it, and neither can anyone else.

That means **nothing in this public repo describes the network**: no addresses,
no hostnames, no metric names, no topology. Not because they are filtered out
here, but because they never arrive.

## The two data planes

|            | Lives in            | Cadence     | When the house is dark |
| ---------- | ------------------- | ----------- | ---------------------- |
| **Baked**  | this bundle, in git | deploy-time | unaffected             |
| **Live**   | KV, one key         | 5 min       | expires, then absent   |

The résumé, the page copy and every joke corpus are baked. Only numbers are
live. `/api/hire` in particular touches no binding — it has to answer with the
rack unplugged, and a test asserts it still does when the asset store is empty.

**The KV key carries a TTL, and that is the honesty mechanism.** If the emitter
stops, the key expires and the edge has nothing to serve but the truth. It
cannot quietly serve last week's numbers, because after fifteen minutes there is
nothing to serve.

## Absent is not zero

Every measured field is nullable, and that is the whole point rather than
defensive habit. A BMC that could not be read is a different fact from a rack
drawing no power. A game server nobody can survey is a different fact from one
that is down. Rendering those the same way is the bug this project keeps
catching in itself:

- the terminal view once said `0 of 5 up` when four of the five had no liveness
  source at all — which reads as five servers down
- `/api/snapshot` once returned `containers` when live and `pods` when dark, and
  omitted `chassis` entirely in one branch

Both were found by tests, not by looking. Absent renders as `—`, and the API
returns `null` with a note saying why.

Of five game servers, exactly one answers a query protocol. `/api/games` states
`surveyable` and `unknown` as separate numbers next to `total`, because there is
no honest single denominator.

## The endpoints

`/api/endpoints` is generated from the same table the router dispatches from, so
a route cannot exist undocumented and a documented route cannot 404.

The jokes are only funny if the numbers are real, so:

- **`/api/blame`** draws from a real incident register, weighted by how often
  each component actually turned out to be at fault. It quotes its `n`, and a
  test asserts the per-component counts still sum to it.
- **`/api/excuse`** entries are real failures with their coordinates stripped.
  Each carries `actually_happened` explicitly — an entry without the flag would
  read as real by default.
- **`/api/uptime`** reports availability, not host uptime. "Up 400 days"
  advertises an unpatched kernel. `window_days` says how much history stands
  behind the number and starts at zero.
- **`/api/yak`** counts branches that are not their repository's default. It was
  going to count open issues and pull requests until that measured zero
  everywhere — which would have published a confident `0` meaning "nothing to
  measure".
- **`/api/rack`** is the one that isn't a joke. Inlet temperature, draw and fan
  speeds off a real BMC, and deliberately last in the list.

## Running it

Needs node 24 (`mise install`).

```
npm install
npm run dev      # local, on workerd
npm test         # vitest, also on workerd
npm run check    # types + formatting
npm run types    # regenerate bindings from wrangler.jsonc
npm run resume   # rebuild resume.txt + resume.pdf from resume.json
npm run deploy
```

`data/resume.json` is the source of truth for the résumé — the JSON endpoint,
the plaintext one and the PDF all derive from it, so they cannot drift apart.
The build refuses to run while any placeholder text remains in the file.

Bindings come from `wrangler types` rather than a hand-written interface, so the
binding list cannot drift from the deploy config. Secrets are the exception:
they are deliberately absent from `wrangler.jsonc` and declared by hand in
`src/types.ts`.

## Layout

```
src/            the Worker: router, negotiation, endpoints, staleness
src/routes.ts   one table — the router and /api/endpoints both read it
data/           résumé and page copy, compiled into the bundle
public/         the page and its generated assets
scripts/        resume.json → resume.txt + resume.pdf
test/           vitest, running inside workerd
```

## Notes to my future self

- **The cadence is set by KV's write budget, not by how fast anything moves.**
  One push every thirty seconds would be ~2,880 writes a day against a free
  allowance near 1,000, and another Worker on the account already spends part of
  it. Availability records *absences* — an hourly heartbeat plus one write when
  a gap closes — for the same reason.
- **Gap detection measures from the outgoing snapshot's own timestamp**, not
  from the last write. Measuring from the last write made an hour of perfect
  uptime look like a one-hour outage.
- **An open outage is counted**, rather than reporting the availability we had
  until things broke. That would be the flattering answer and the wrong one.
- **`run_worker_first` is a path list, not `true`** — `/` must reach the Worker
  to choose HTML or text, but the PDF and any future asset should not wake it.
- **Workers, not Pages.** Pages serves `index.html` for `/` before a Function
  runs, which is exactly the decision this site needs to make itself.
- **Contract numbers gate rendering.** The Worker refuses a snapshot whose
  contract it does not know, because reading fields at the wrong offsets and
  presenting the result confidently is worse than showing nothing.

## Licence

MIT for the code. The résumé and the page copy are mine.
