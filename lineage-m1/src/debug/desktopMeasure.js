// @ts-check
/**
 * Desktop and device frame-time / memory instrumentation (contract §22
 * "Desktop measurement" and the manual iPad gate evidence requirements).
 *
 * Pure measurement. Never touches biological state or simRng.
 */

export class FrameMeter {
  constructor() {
    this.intervals = [];
    this.lastTimestamp = null;
    this.warmupMs = 0;
    this.started = null;
    /** @type {number[]} input-to-next-paint latencies in ms */
    this.inputLatencies = [];
    this.pendingInput = null;
  }

  /** Begin collecting after a warm-up window. */
  start(warmupMs = 30000) {
    this.warmupMs = warmupMs;
    this.started = now();
    this.intervals = [];
    this.inputLatencies = [];
    this.lastTimestamp = null;
  }

  /** Call once per rendered frame. */
  tick() {
    const t = now();
    if (this.lastTimestamp !== null) {
      const dt = t - this.lastTimestamp;
      if (this.started !== null && t - this.started >= this.warmupMs) {
        this.intervals.push(dt);
      }
    }
    this.lastTimestamp = t;
    if (this.pendingInput !== null) {
      this.inputLatencies.push(t - this.pendingInput);
      this.pendingInput = null;
    }
  }

  /** Mark a control action; the next painted frame closes the measurement. */
  markInput() {
    if (this.pendingInput === null) this.pendingInput = now();
  }

  /** Summary statistics for the report. */
  summary() {
    const v = this.intervals.slice().sort((a, b) => a - b);
    const lat = this.inputLatencies.slice().sort((a, b) => a - b);
    const pick = (arr, p) => (arr.length ? arr[Math.max(0, Math.min(arr.length - 1, Math.ceil((p / 100) * arr.length) - 1))] : null);
    return {
      frameCount: v.length,
      medianFrameTimeMs: pick(v, 50),
      p95FrameTimeMs: pick(v, 95),
      maxFrameTimeMs: v.length ? v[v.length - 1] : null,
      inputActionCount: lat.length,
      p95InputToNextPaintMs: pick(lat, 95),
      memory: readMemory(),
    };
  }
}

function now() {
  return typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
}

/** Best-effort heap reading; unavailable in Safari, which is reported honestly. */
export function readMemory() {
  const perf = /** @type {any} */ (globalThis.performance);
  if (perf && perf.memory && typeof perf.memory.usedJSHeapSize === "number") {
    return { usedJSHeapBytes: perf.memory.usedJSHeapSize, available: true };
  }
  return { usedJSHeapBytes: null, available: false, note: "performance.memory is not exposed in this browser" };
}

/**
 * Record viewport and device-pixel-ratio context for the measurement record.
 */
export function environmentSnapshot() {
  return {
    viewport: {
      width: globalThis.innerWidth ?? null,
      height: globalThis.innerHeight ?? null,
    },
    devicePixelRatio: globalThis.devicePixelRatio ?? null,
    userAgent: globalThis.navigator ? globalThis.navigator.userAgent : null,
  };
}
