import type { CacheStorage } from '../storage/types.js';
import type { Pending } from './protocol.js';

/** Default how long a worker waits for the primary to answer (ms). */
export const DEFAULT_REQUEST_TIMEOUT_MS = 2000;

/**
 * Shared state that lives once per process.
 * Ensures we only attach message handlers a single time and that the
 * primary has a single authoritative store.
 */
export const state = {
  initialized: false,
  /**
   * Authoritative storage on the primary / single-process.
   * Set by the first ClusterTransport constructed in this process.
   */
  storage: null as CacheStorage<unknown, unknown> | null,
  /** Correlation-ID → pending Promise (workers only). */
  pending: new Map<string, Pending>(),
  /** Worker IPC timeout in ms (from first constructor options). */
  requestTimeoutMs: DEFAULT_REQUEST_TIMEOUT_MS,
};

/**
 * Clears the process-wide storage registration and pending IPC requests.
 * Intended for unit tests so each case can register a fresh data store.
 * Does not remove message listeners (those remain installed once per process).
 *
 * @internal
 */
export function resetClusterTransportForTests(): void {
  for (const pending of state.pending.values()) {
    clearTimeout(pending.timer);
  }
  state.storage = null;
  state.pending.clear();
  state.requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS;
  // Allow ensureInitialized() to run again in tests (may stack listeners).
  state.initialized = false;
}
