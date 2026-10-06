import { randomUUID } from 'node:crypto';
import type { CacheStorage } from '../storage/types.js';
import { MapStorage } from '../storage/map-storage.js';
import { MSG_TYPE, type Op } from './protocol.js';
import { state } from './state.js';
import { isWorker } from './is-worker.js';
import { ensureInitialized } from './handlers.js';

/**
 * Options for {@link ClusterTransport}.
 *
 * @typeParam K - Key type
 * @typeParam V - Value type
 */
export interface ClusterTransportOptions<K = string, V = unknown> {
  /**
   * Data store used on the primary (or in single-process mode).
   * Ignored on workers — they always proxy via IPC.
   *
   * Defaults to a new {@link MapStorage}.
   * Pass any {@link CacheStorage} implementation (LRU, Redis, custom, …).
   *
   * @defaultValue `new MapStorage()`
   */
  storage?: CacheStorage<K, V>;

  /**
   * How long workers wait for the primary to reply to an IPC request, in ms.
   * On timeout the operation rejects with an error that reminds you to call
   * `createCache()` on the primary.
   *
   * @defaultValue 2000
   */
  requestTimeoutMs?: number;
}

/**
 * Cluster IPC transport that delegates data operations to any
 * {@link CacheStorage}.
 *
 * - **Primary / single-process**: operations go to the supplied (or default)
 *   storage.
 * - **Worker**: operations are sent over IPC; the primary executes them
 *   against its storage and replies. Requests time out if the primary
 *   never answers (e.g. `createCache()` was not called on the primary).
 *
 * Application code normally does not construct this directly — use
 * {@link createCache}, which wraps your storage automatically.
 *
 * The first `ClusterTransport` created in a process determines the storage
 * used on the primary. Later instances reuse it.
 *
 * @typeParam K - Key type (defaults to `string`)
 * @typeParam V - Value type (defaults to `unknown`)
 *
 * @remarks
 * Values must be structured-cloneable when crossing the IPC boundary
 * (the same constraint as `worker.send()` / `process.send()`).
 */
export class ClusterTransport<K = string, V = unknown> implements CacheStorage<K, V> {
  constructor(options: ClusterTransportOptions<K, V> = {}) {
    // Register storage on the primary / single-process side.
    // First constructor wins; subsequent ones reuse the existing storage.
    if (!isWorker() && state.storage === null) {
      const store: CacheStorage<K, V> = options.storage ?? new MapStorage<K, V>();
      // Process-wide registry is key/value agnostic (erase K/V for shared state)
      state.storage = store as unknown as CacheStorage<unknown, unknown>;
    }

    if (options.requestTimeoutMs !== undefined) {
      if (
        typeof options.requestTimeoutMs !== 'number' ||
        !Number.isFinite(options.requestTimeoutMs) ||
        options.requestTimeoutMs <= 0
      ) {
        throw new TypeError('c-cache: requestTimeoutMs must be a positive number');
      }
      state.requestTimeoutMs = options.requestTimeoutMs;
    }

    ensureInitialized();
  }

  /**
   * Send a request to the primary and wait for the matching reply.
   * Only used on workers. Rejects if the primary does not reply in time.
   */
  #request(op: Op, key?: K, value?: V): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = randomUUID();
      const timeoutMs = state.requestTimeoutMs;

      const timer = setTimeout(() => {
        state.pending.delete(id);
        reject(
          new Error(
            `c-cache: no response from primary within ${timeoutMs}ms — ` +
              'call createCache() in the primary process (not only in workers)',
          ),
        );
      }, timeoutMs);

      state.pending.set(id, { resolve, reject, timer });

      const msg = { type: MSG_TYPE, id, op, key, value };

      const ok = process.send?.(msg);
      if (!ok) {
        clearTimeout(timer);
        state.pending.delete(id);
        reject(new Error('c-cache: process.send() failed — is this process a cluster worker?'));
      }
    });
  }

  async get(key: K): Promise<V | undefined> {
    if (isWorker()) {
      return (await this.#request('get', key)) as V | undefined;
    }
    return (await state.storage!.get(key)) as V | undefined;
  }

  async set(key: K, value: V): Promise<void> {
    if (isWorker()) {
      await this.#request('set', key, value);
      return;
    }
    await state.storage!.set(key, value);
  }

  async delete(key: K): Promise<boolean> {
    if (isWorker()) {
      return (await this.#request('delete', key)) as boolean;
    }
    return await state.storage!.delete(key);
  }

  async has(key: K): Promise<boolean> {
    if (isWorker()) {
      return (await this.#request('has', key)) as boolean;
    }
    return await state.storage!.has(key);
  }

  async clear(): Promise<void> {
    if (isWorker()) {
      await this.#request('clear');
      return;
    }
    await state.storage!.clear();
  }
}

export { resetClusterTransportForTests, DEFAULT_REQUEST_TIMEOUT_MS } from './state.js';
