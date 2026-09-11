# tyco.sh

My homepage, and a small JSON API attached to it.

The API is mostly jokes, but the numbers behind the jokes are real — they come
from the rack in my office. Nothing public reaches that network: a process
inside it pushes a snapshot out to the edge every thirty seconds, and this
Worker serves whatever arrived last. If the house goes dark the snapshot
expires and the site says so, rather than showing you a stale number or a zero.

```
curl tyco.sh                    the page, for terminals
curl tyco.sh/api/hire | jq      a résumé, as JSON Resume
curl tyco.sh/api/endpoints      everything else
curl tyco.sh/api/is-it-dns      it is
```

## Running it

Needs node 24 (`mise install`).

```
npm install
npm run dev      # local, on workerd
npm test         # vitest, also on workerd
npm run check    # types + formatting
npm run deploy
```

`data/resume.json` is the source of truth for the résumé — the JSON endpoint,
the plaintext one and the PDF all derive from it, so they cannot drift apart.
`npm run resume` regenerates the derived copies and refuses to run while any
placeholder text is still in the file.

## Layout

```
src/            the Worker: router, content negotiation, endpoints
data/           résumé and page copy, compiled into the bundle
public/         the page and its assets
test/           vitest, running inside workerd
```

The emitter that feeds this lives elsewhere, in a private repo, along with
everything that would describe my network.

## Licence

MIT for the code. The résumé and the page copy are mine.
