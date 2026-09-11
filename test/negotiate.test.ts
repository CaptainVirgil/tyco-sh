import { describe, expect, it } from 'vitest';
import { isTerminal, prefers } from '../src/negotiate';

function req(headers: Record<string, string>): Request {
  return new Request('https://tyco.sh/', { headers });
}

describe('prefers', () => {
  it('scores an exact match above a wildcard at the same q', () => {
    const r = req({ Accept: 'text/plain, */*' });
    expect(prefers(r, 'text/plain')).toBeGreaterThan(prefers(r, 'text/html'));
  });

  it('honours q-values', () => {
    const r = req({ Accept: 'text/html;q=0.2, application/json;q=0.9' });
    expect(prefers(r, 'application/json')).toBeGreaterThan(prefers(r, 'text/html'));
  });

  it('is zero for a type nothing matches', () => {
    expect(prefers(req({ Accept: 'text/html' }), 'application/pdf')).toBe(0);
  });

  it('treats a missing Accept as no preference at all', () => {
    expect(prefers(req({}), 'text/html')).toBe(0);
  });
});

describe('isTerminal', () => {
  // curl sends a wildcard Accept, so the UA is the only thing separating it
  // from a browser. This is the case the whole function exists for.
  it('detects curl despite its wildcard Accept', () => {
    expect(isTerminal(req({ 'User-Agent': 'curl/8.5.0', Accept: '*/*' }))).toBe(true);
  });

  it.each([
    ['Wget/1.21.4', true],
    ['HTTPie/3.2.2', true],
    ['python-requests/2.32.3', true],
    ['Go-http-client/2.0', true],
  ])('detects %s', (ua, want) => {
    expect(isTerminal(req({ 'User-Agent': ua, Accept: '*/*' }))).toBe(want);
  });

  it('does not mistake a browser for a terminal', () => {
    const ua =
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';
    const accept = 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,*/*;q=0.8';
    expect(isTerminal(req({ 'User-Agent': ua, Accept: accept }))).toBe(false);
  });

  it('treats a missing User-Agent as a script', () => {
    expect(isTerminal(req({}))).toBe(true);
  });

  it('lets an explicit text/plain win even from a browser UA', () => {
    const ua = 'Mozilla/5.0 (X11; Linux x86_64) Chrome/140.0';
    expect(isTerminal(req({ 'User-Agent': ua, Accept: 'text/plain' }))).toBe(true);
  });
});
