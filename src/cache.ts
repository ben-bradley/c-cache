import type { CacheStorage } from './storage/types.js';
import type { MapStorageOptions } from './storage/map-storage.js';
import { ClusterTransport } from './transport/index.js';
import { MapStorage } from './storage/map-storage.js';

/** Method names required by the CacheStorage contract. */
const REQUIRED_METHODS = ['get', 'set', 'delete', 'has', 'clear'] as const;

/**
 * Assert that `value` looks like a usable CacheStorage.
 * Throws TypeError with a clear message when validation fails.
 */
function assertCacheStorage(value: unknown, label: string): asserts value is CacheStorage {
  if (value === null || typeof value !== 'object') {
    throw new TypeError(`c-cache: ${label} must be an object that implements CacheStorage`);
  }

  for (const method of REQUIRED_METHODS) {
    if (typeof (value as Record<string, unknown>)[method] !== 'function') {
      throw new TypeError(
        `c-cache: ${label} is missing required method "${method}" (CacheStorage contract)`,
      );
    }
  }
}

/**
 * Options accepted by {@link Cache} and {@link createCache}.
 *
 * Provide either a custom {@link CacheOptions.storage}, or size/TTL
 * fields that configure the default {@link MapStorage}. Mixing both
 * is an error.
 *
 * @typeParam K - Key type (defaults to `string`)
 * @typeParam V - Value type (defaults to `unknown`)
 */
export interface CacheOptions<K = string, V = unknown> extends MapStorageOptions {
  /**
   * Data store used underneath the cluster/IPC layer.
   *
   * When omitted, a {@link MapStorage} is created using any `max`,
   * `ttl`, `updateAgeOnGet`, and `allowStale` fields from these options.
   *
   * Do not pass both `storage` and MapStorage bound options (`max`,
   * `ttl`, etc.) — that combination throws.
   */
  storage?: CacheStorage<K, V>;
}

const MAP_OPTION_KEYS = ['max', 'ttl', 'updateAgeOnGet', 'allowStale'] as const;

function hasMapOptions(options: MapStorageOptions): boolean {
  return MAP_OPTION_KEYS.some((key) => options[key] !== undefined);
}

/**
 * Build a MapStorageOptions object without writing explicit `undefined`
 * properties (required when `exactOptionalPropertyTypes` is on).
 */
function toMapStorageOptions(options: MapStorageOptions): MapStorageOptions {
  const result: MapStorageOptions = {};
  if (options.max !== undefined) result.max = options.max;
  if (options.ttl !== undefined) result.ttl = options.ttl;
  if (options.updateAgeOnGet !== undefined) result.updateAgeOnGet = options.updateAgeOnGet;
  if (options.allowStale !== undefined) result.allowStale = options.allowStale;
  return result;
}

/**
 * Cluster-aware cache façade.
 *
 * Always shared across Node.js cluster workers. The optional
 * {@link CacheOptions.storage} is the data store (Map by default);
 * the library handles IPC so application code never branches on
 * `cluster.isPrimary`.
 *
 * @typeParam K - Key type (defaults to `string`)
 * @typeParam V - Value type (defaults to `unknown`)
 *
 * @example
 * ```ts
 * const cache = createCache<string, number>({ max: 1000, ttl: 60_000 });
 * await cache.set('count', 42);
 * console.log(await cache.get('count')); // 42 — visible to every worker
 * ```
 */
export class Cache<K = string, V = unknown> {
  /** Cluster IPC layer (wraps the user-supplied or default data store). */
  readonly #transport: CacheStorage<K, V>;

  /**
   * Create a new cluster-aware Cache.
   *
   * @param options - Optional configuration
   * @throws {TypeError} If `options.storage` does not implement CacheStorage,
   *         or if both `storage` and Map bound options are provided
   */
  constructor(options: CacheOptions<K, V> = {}) {
    const { storage } = options;

    if (storage !== undefined && hasMapOptions(options)) {
      throw new TypeError(
        'c-cache: pass either options.storage or MapStorage options (max, ttl, …), not both',
      );
    }

    let dataStore: CacheStorage<K, V>;

    if (storage !== undefined) {
      assertCacheStorage(storage, 'options.storage');
      dataStore = storage;
    } else {
      dataStore = new MapStorage<K, V>(toMapStorageOptions(options));
    }

    this.#transport = new ClusterTransport<K, V>({ storage: dataStore });
  }

  /**
   * Retrieve the value associated with `key`.
   *
   * @param key - The key to look up
   * @returns A promise that resolves to the stored value, or `undefined`
   *          if the key does not exist
   */
  async get(key: K): Promise<V | undefined> {
    return this.#transport.get(key);
  }

  /**
   * Store a value under `key`. Overwrites any existing value.
   *
   * @param key - The key to set
   * @param value - The value to store
   * @returns A promise that resolves when the write has completed
   */
  async set(key: K, value: V): Promise<void> {
    await this.#transport.set(key, value);
  }

  /**
   * Remove the entry for `key`.
   *
   * @param key - The key to remove
   * @returns A promise that resolves to `true` if the key existed and was
   *          deleted, otherwise `false`
   */
  async delete(key: K): Promise<boolean> {
    return this.#transport.delete(key);
  }

  /**
   * Check whether `key` exists in the cache.
   *
   * @param key - The key to test
   * @returns A promise that resolves to `true` if the key exists,
   *          otherwise `false`
   */
  async has(key: K): Promise<boolean> {
    return this.#transport.has(key);
  }

  /**
   * Remove every entry from the cache.
   *
   * @returns A promise that resolves when the cache has been cleared
   */
  async clear(): Promise<void> {
    await this.#transport.clear();
  }
}

/**
 * Create a cluster-aware cache.
 *
 * The cache is always shared across workers. Pass `storage` for a custom
 * data store, or `max` / `ttl` / … to configure the default Map store.
 *
 * @typeParam K - Key type (defaults to `string`)
 * @typeParam V - Value type (defaults to `unknown`)
 * @param options - Optional configuration (see {@link CacheOptions})
 * @returns A new {@link Cache} instance
 *
 * @example
 * ```ts
 * import cluster from 'node:cluster';
 * import { createCache } from 'c-cache';
 *
 * // Call in every process so the primary registers storage + IPC handlers
 * const cache = createCache<string, { name: string }>({
 *   max: 10_000,
 *   ttl: 5 * 60_000,
 * });
 *
 * if (cluster.isPrimary) {
 *   for (let i = 0; i < 4; i++) cluster.fork();
 * } else {
 *   await cache.set('user:42', { name: 'Ada' });
 *   console.log(await cache.get('user:42'));
 * }
 * ```
 */
export function createCache<K = string, V = unknown>(
  options: CacheOptions<K, V> = {},
): Cache<K, V> {
  return new Cache(options);
}
