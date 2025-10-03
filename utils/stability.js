// utils/stability.js
// Per-key stabilizer: first sample commits; later changes must repeat (2x) to commit.

export const MIN_CONSECUTIVE = 2;
export const MAX_WAIT_MS = 30000;

const isInfo = (v) => v && typeof v === "object" && typeof v.level === "string";

export function sameInfo(a, b) {
  if (!isInfo(a) || !isInfo(b)) return false;
  return a.level === b.level;
}

export function knownCount(obj) {
  if (!obj || typeof obj !== "object") return 0;
  let k = 0;
  for (const v of Object.values(obj)) {
    if (isInfo(v) && v.level !== "na") k++;
  }
  return k;
}

function initCounters(sample) {
  const counters = {};
  for (const k of Object.keys(sample)) counters[k] = 1;
  return counters;
}

/**
 * confirmPerKeyChange
 * @param {Object} opts
 *   - lastAccepted
 *   - lastPending: { infos, counts, firstAt }
 *   - nextSample
 */
export function confirmPerKeyChange(opts) {
  const {
    lastAccepted = null,
    lastPending = null,
    nextSample,
    minConsecutive = MIN_CONSECUTIVE,
    maxWaitMs = MAX_WAIT_MS,
  } = opts || {};

  // Bootstrap: commit immediately on the first sample
  if (!lastAccepted && !lastPending) {
    return {
      committed: nextSample,
      nextPending: { infos: nextSample, counts: initCounters(nextSample), firstAt: Date.now() },
    };
  }

  const committed = { ...(lastAccepted || {}) };
  let pendingInfos = lastPending?.infos || nextSample;
  let counts = lastPending?.counts || initCounters(nextSample);
  const firstAt = lastPending?.firstAt || Date.now();

  for (const key of Object.keys(nextSample)) {
    const next = nextSample[key];
    const prevCommitted = committed[key];

    if (!isInfo(next)) {
      counts[key] = 1;
      continue;
    }

    if (!isInfo(prevCommitted)) {
      committed[key] = next;
      pendingInfos[key] = next;
      counts[key] = 1;
      continue;
    }

    if (sameInfo(next, prevCommitted)) {
      pendingInfos[key] = next;
      counts[key] = 1;
      continue;
    }

    if (sameInfo(next, pendingInfos[key])) {
      counts[key] = (counts[key] || 1) + 1;
    } else {
      pendingInfos[key] = next;
      counts[key] = 1;
    }

    const waitedMs = Date.now() - firstAt;
    if (counts[key] >= minConsecutive || waitedMs >= maxWaitMs) {
      committed[key] = next;
      counts[key] = 1;
    }
  }

  return {
    committed,
    nextPending: { infos: pendingInfos, counts, firstAt },
  };
}
