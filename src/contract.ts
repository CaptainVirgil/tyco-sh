/**
 * CONTRACT is the shape of the live snapshot, not the version of the site.
 *
 * The emitter inside the LAN stamps the number it built against; this Worker
 * refuses to render a snapshot whose contract it does not recognise. A number
 * it has never heard of means the two halves shipped out of step, and the
 * honest answer is "no data" rather than fields read at the wrong offsets.
 *
 * Bump on any change to the snapshot's shape. Never on copy or styling.
 */
export const CONTRACT = 2;

/** Contracts this Worker can read. Keep the current one, plus any it can still parse. */
export const KNOWN_CONTRACTS: readonly number[] = [1, 2];
// 1 is still readable: it differs only in the shape of `yak`, which was always
// null under it. A stored contract-1 snapshot renders correctly with yak absent.
