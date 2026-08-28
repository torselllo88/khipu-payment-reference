/**
 * Every event in a checkout burst happens synchronously, milliseconds apart
 * in wall-clock time — which reads as suspiciously instant for a flow meant
 * to illustrate an asynchronous A2A lifecycle. This produces a sequence of
 * synthetic timestamps instead: not real elapsed time, just deliberate
 * spacing so the timeline visually communicates which steps are inherently
 * slower (e.g. Khipu reconciling with the bank) versus near-instant
 * (a redirect, an HTTP round trip).
 */
export function createVirtualClock(startAt: number = Date.now()) {
  let now = startAt;
  return {
    tick(deltaMs: number): number {
      now += deltaMs;
      return now;
    },
  };
}

/**
 * For a single event appended by a manually-triggered action (replay,
 * reconcile) rather than a scripted burst: real `Date.now()` is normally the
 * honest value, since a real user action happens at a genuinely later real
 * time. But the checkout burst's own synthetic clock may have already run
 * well ahead of real time (see createVirtualClock) — if the action fires
 * before real time catches up, using bare Date.now() would land *before*
 * the order's last logged event. This picks whichever is later, so the
 * timeline never appears to run backward.
 */
export function continueFrom(lastTimestamp: number, minDeltaMs: number = 1000): number {
  return Math.max(Date.now(), lastTimestamp + minDeltaMs);
}
