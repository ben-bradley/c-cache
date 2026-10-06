import type { CacheStorage } from './types.js';

/**
 * Options for {@link MapStorage}.
 */
export interface MapStorageOptions {
  /**
   * Maximum number of entries to keep.
   * When exceeded, the least-recently-used entry is evicted.
   * Must be a positive integer if set.
   */
  max?: number;

  /**
   * Default time-to-live for entries, in milliseconds.
   * Expired entries are removed lazily on `get` / `has`.
   * Must be a positive number if set.
   */
  ttl?: number;

  /**
   * When `true` and `ttl` is set, successful `get` calls refresh
   * the entry's expiry to `now + ttl`.
   *
   * @defaultValue false
   */
  updateAgeOnGet?: boolean;

  /**
   * When `true` and an entry is expired, `get` still returns the
   * stale value once, then deletes the entry.
   * `has` always reports `false` for expired keys.
   *
   * @defaultValue false
   */
  allowStale?: boolean;
}

/** Internal record stored in the Map. */
interface Entry<V> {
  value: V;
  /** Epoch ms when the entry expires; omitted means no expiry. */
  expiresAt?: number;
}

/**
 * In-process {@link Map}-backed storage with optional size bound and TTL.
 *
 * This is the default data store used by {@link createCache} when no
 * custom `storage` is supplied. Under cluster it runs only on the
 * primary; workers reach it via {@link ClusterTransport}.
 *
 * Recency for `max` eviction is tracked via Map insertion order:
 * each `get` / `set` moves the key to the end (most-recent).
 *
 * @typeParam K - Key type (defaults to `string`)
 * @typeParam V - Value type (defaults to `unknown`)
 *
 * @example
 * ```ts
 * const storage = new MapStorage<string, number>({ max: 100, ttl: 60_000 });
 * storage.set('count', 1);
 * storage.get('count'); // 1
 * ```
 */
export class MapStorage<K = string, V = unknown> implements CacheStorage<K, V> {
  readonly #max: number | undefined;
  readonly #ttl: number | undefined;
  readonly #updateAgeOnGet: boolean;
  readonly #allowStale: boolean;
  readonly #store = new Map<K, Entry<V>>();

  /**
   * @param options - Size / TTL configuration
   * @throws {TypeError} If `max` or `ttl` are present but not positive
   */
  constructor(options: MapStorageOptions = {}) {
    if (options.max !== undefined) {
      if (typeof options.max !== 'number' || !Number.isFinite(options.max) || options.max <= 0) {
        throw new TypeError('c-cache: MapStorage options.max must be a positive number');
      }
      this.#max = Math.floor(options.max);
    }

    if (options.ttl !== undefined) {
      if (typeof options.ttl !== 'number' || !Number.isFinite(options.ttl) || options.ttl <= 0) {
        throw new TypeError('c-cache: MapStorage options.ttl must be a positive number');
      }
      this.#ttl = options.ttl;
    }

    this.#updateAgeOnGet = options.updateAgeOnGet === true;
    this.#allowStale = options.allowStale === true;
  }

  /**
   * Retrieve the value associated with `key`.
   *
   * Handles TTL expiry (and optional stale read) and updates recency
   * for LRU-style eviction when `max` is set.
   */
  get(key: K): V | undefined {
    const entry = this.#store.get(key);
    if (!entry) return undefined;

    if (this.#isExpired(entry)) {
      if (this.#allowStale) {
        this.#store.delete(key);
        return entry.value;
      }
      this.#store.delete(key);
      return undefined;
    }

    // Refresh TTL if requested
    if (this.#updateAgeOnGet && this.#ttl !== undefined) {
      entry.expiresAt = Date.now() + this.#ttl;
    }

    // Move to end = most recently used (Map insertion order)
    if (this.#max !== undefined) {
      this.#store.delete(key);
      this.#store.set(key, entry);
    }

    return entry.value;
  }

  /**
   * Store a value under `key`. Overwrites any existing value.
   * Evicts the least-recently-used entry when `max` is exceeded.
   */
  set(key: K, value: V): void {
    // Re-insert to update recency even on overwrite
    if (this.#store.has(key)) {
      this.#store.delete(key);
    } else if (this.#max !== undefined && this.#store.size >= this.#max) {
      // Evict least-recently-used (first key in Map)
      const oldest = this.#store.keys().next().value;
      if (oldest !== undefined) {
        this.#store.delete(oldest);
      }
    }

    const entry: Entry<V> = { value };
    if (this.#ttl !== undefined) {
      entry.expiresAt = Date.now() + this.#ttl;
    }
    this.#store.set(key, entry);
  }

  /**
   * Remove the entry for `key`.
   *
   * @returns `true` if the key existed and was deleted, otherwise `false`
   */
  delete(key: K): boolean {
    return this.#store.delete(key);
  }

  /**
   * Check whether `key` exists and is not expired.
   */
  has(key: K): boolean {
    const entry = this.#store.get(key);
    if (!entry) return false;

    if (this.#isExpired(entry)) {
      this.#store.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Remove every entry from the storage.
   */
  clear(): void {
    this.#store.clear();
  }

  #isExpired(entry: Entry<V>): boolean {
    return entry.expiresAt !== undefined && Date.now() >= entry.expiresAt;
  }
}
