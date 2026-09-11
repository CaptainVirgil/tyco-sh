/**
 * Every word the site says about itself.
 *
 * Capabilities, never applications. "replicated block storage" is a capability;
 * naming the product that provides it tells a stranger what to go looking for,
 * and the list of things running in the house is not public information.
 */

export const IDENTITY = {
  name: 'William Virgil Wolff',
  tagline: 'IT director · systems engineer · a rack in Indiana',
  email: 'virgil@tyco.sh',
  github: 'https://github.com/CaptainVirgil',
  linkedin: 'https://www.linkedin.com/in/captainvirgil/',
} as const;

export const CAPABILITIES: ReadonlyArray<{ group: string; detail: string }> = [
  { group: 'compute', detail: 'six-node HA Kubernetes · five-node ARM cluster · a 2U hypervisor' },
  { group: 'network', detail: 'ten routed segments · BSD firewall · controller-managed wireless' },
  { group: 'identity', detail: 'single sign-on across every service · a self-hosted secret vault' },
  {
    group: 'storage',
    detail: 'replicated block storage · snapshotting filesystems · offsite copies',
  },
  {
    group: 'delivery',
    detail: 'GitOps reconciliation · a self-hosted forge · daemonless image builds',
  },
  { group: 'games', detail: 'five servers, systemd-owned, one panel I wrote' },
];

/**
 * The person, briefly. It sits under the work rather than over it: the page
 * should establish what he does before it gets personal.
 *
 * The Expanse line is doing quiet double duty — it is true, and it explains
 * the domain without the site ever having to be themed around it.
 */
export const BIO: readonly string[] = [
  'Full-time dad and husband first; everything on this page happens after bedtime.',
  'Been taking computers apart since I was nine and never really stopped.',
  'Plays hockey.',
  'Favorite show is The Expanse, which is where this domain got its name.',
];

/** Lead with the constraint. Feature lists are forgettable; constraints are not. */
export const WORK: ReadonlyArray<{ name: string; line: string }> = [
  {
    name: 'roost',
    line: 'Five game servers, one box, systemd owns every process. The panel observes and never guesses where a dbus signal already exists.',
  },
  {
    name: 'wake',
    line: 'The venue serves no history and caps fills per wallet, so the recorded dataset is irreplaceable and downtime is permanent loss.',
  },
  {
    name: 'tyco-home',
    line: 'The backend sends raw state; the browser derives every rendered word, so a rule change is a page edit, not a redeploy.',
  },
  {
    name: 'KenshiCoop',
    line: 'Two-player co-op grafted into a game never built for it, in C++03 against a 2010 toolchain, driven by two humans’ session logs.',
  },
];

/**
 * The business first, then the toys. The toys earn their place precisely by
 * being frivolous — a page of clusters and rack sensors reads as humourless,
 * and two pointless domains someone keeps paying for says otherwise.
 */
export const ELSEWHERE: ReadonlyArray<{ host: string; what: string }> = [
  { host: 'stacksavr.com', what: 'my MSP — flat-rate IT for small business' },
  { host: 'runegateway.com', what: 'a CSS animation and nothing else' },
  { host: 'makeubutr.com', what: 'a reference to an old gamertag' },
];

export const ASCII = String.raw`
  ▄▄▄ TYCO ▄▄▄
`.trim();
