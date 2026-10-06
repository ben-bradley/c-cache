/**
 * @module c-cache
 *
 * Common caching for Node.js cluster workers with pluggable storage.
 *
 * `createCache()` always returns a **cluster-aware** cache. Data written
 * in any worker is visible to every other worker. No `cluster.isPrimary`
 * checks or manual bootstrap are required.
 *
 * The default data store is {@link MapStorage}, which supports `max`,
 * `ttl`, `updateAgeOnGet`, and `allowStale`. Pass a custom
 * {@link CacheStorage} via `storage` for other backends (e.g. a future
 * LRU or Redis adapter package).
 *
 * @packageDocumentation
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

/** Storage contract — implement this to plug in a custom data store. */
export type { CacheStorage } from './storage/types.js';

/** Default in-process Map data store (supports max / ttl). */
export { MapStorage } from './storage/map-storage.js';
export type { MapStorageOptions } from './storage/map-storage.js';

/** Cluster IPC transport (used internally; available for advanced use). */
export { ClusterTransport } from './transport/index.js';
export type { ClusterTransportOptions } from './transport/index.js';

/** Main Cache class and factory. */
export { createCache, Cache } from './cache.js';

/** Cache construction options. */
export type { CacheOptions } from './cache.js';
