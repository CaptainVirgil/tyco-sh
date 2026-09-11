/**
 * Who is asking: a terminal or a browser.
 *
 * curl sends a wildcard Accept header, so Accept alone cannot tell the two
 * apart — the User-Agent is the load-bearing signal here, with Accept only
 * consulted when it states an actual preference. Getting this backwards
 * serves a wall of HTML into someone's scrollback.
 */

const TERMINAL_AGENTS = [
  /^curl\//i,
  /^Wget/i,
  /^HTTPie\//i,
  /^python-requests\//i,
  /^PowerShell\//i,
  /^WindowsPowerShell\//i,
  /^Go-http-client\//i,
  /^httpx\//i,
  /^lwp-request\//i,
];

export function isTerminal(request: Request): boolean {
  const ua = request.headers.get('User-Agent') ?? '';
  if (TERMINAL_AGENTS.some((re) => re.test(ua))) return true;

  // No UA at all is far more likely a script than a browser.
  if (ua === '') return true;

  return prefers(request, 'text/plain') > prefers(request, 'text/html');
}

/**
 * The q-value this request assigns to a media type. A wildcard counts, at its
 * own q, because a client that accepts anything has stated no preference
 * between two concrete types — which is exactly the tie `isTerminal` then
 * breaks on the User-Agent.
 */
export function prefers(request: Request, mediaType: string): number {
  const accept = request.headers.get('Accept');
  if (!accept) return 0;

  const type = mediaType.split('/')[0];
  let best = 0;

  for (const raw of accept.split(',')) {
    const parts = raw.trim().split(';');
    const candidate = (parts[0] ?? '').trim().toLowerCase();
    if (!candidate) continue;

    const isExact = candidate === mediaType;
    const isTypeWild = candidate === `${type}/*`;
    const isFullWild = candidate === '*/*';
    if (!isExact && !isTypeWild && !isFullWild) continue;

    let q = 1;
    for (const param of parts.slice(1)) {
      const [k, v] = param.split('=');
      if (k?.trim().toLowerCase() === 'q') {
        const parsed = Number.parseFloat(v ?? '');
        if (!Number.isNaN(parsed)) q = parsed;
      }
    }

    // An exact match outranks a wildcard at the same q, which is what makes an
    // explicit `Accept: text/plain` beat a wildcard rather than tie with it.
    const specificity = isExact ? 0.001 : isTypeWild ? 0.0005 : 0;
    best = Math.max(best, q + specificity);
  }

  return best;
}
