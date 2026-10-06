/**
 * Minimal storage contract for c-cache.
 *
 * Any backend (in-process Map, LRU instance, Redis client, IPC proxy, …)
 * must implement this interface so the {@link Cache} layer stays
 * backend-agnostic.
 *
 * Methods may be synchronous or asynchronous — the Cache façade always
 * awaits the result, so both styles are supported.
 *
 * @typeParam K - Key type (defaults to `string`)
 * @typeParam V - Value type (defaults to `unknown`)
 *
 * @example
 * ```ts
 * const custom: CacheStorage<string, number> = {
 *   get: (k) => store.get(k),
 *   set: (k, v) => { store.set(k, v); },
 *   delete: (k) => store.delete(k),
 *   has: (k) => store.has(k),
 *   clear: () => { store.clear(); },
 * };
 * ```
 */
export interface CacheStorage<K = string, V = unknown> {
  /**
   * Retrieve the value associated with `key`.
   *
   * @param key - The key to look up
   * @returns The stored value, or `undefined` if the key does not exist
   */
  get(key: K): Promise<V | undefined> | V | undefined;

  /**
   * Store a value under `key`. Overwrites any existing value.
   *
   * @param key - The key to set
   * @param value - The value to store
   */
  set(key: K, value: V): Promise<void> | void;

  /**
   * Remove the entry for `key`.
   *
   * @param key - The key to remove
   * @returns `true` if the key existed and was deleted, otherwise `false`
   */
  delete(key: K): Promise<boolean> | boolean;

  /**
   * Check whether `key` exists in the storage.
   *
   * @param key - The key to test
   * @returns `true` if the key exists, otherwise `false`
   */
  has(key: K): Promise<boolean> | boolean;

  /**
   * Remove every entry from the storage.
   */
  clear(): Promise<void> | void;

  // Optional size / keys can be added later as needed
}
