# c-cache

Cluster-aware caching for Node.js worker processes, with pluggable storage.

## Why

Most caching libraries only work inside a single process. With `node:cluster`, each worker has its own memory — a hit on worker 1 is a miss on worker 2.

**c-cache** gives you one logical cache shared across all workers. You choose the data store (Map by default; optional packages later for LRU, Redis, etc.); the library handles the IPC.

## Quick start

```ts
import cluster from 'node:cluster';
import { availableParallelism } from 'node:os';
import { createCache } from '@ben-bradley/c-cache';

// Create the cache in every process. On the primary this registers the
// data store and IPC handlers; on workers it proxies over cluster IPC.
const cache = createCache<string, { name: string }>({
  max: 10_000,
  ttl: 5 * 60_000, // 5 minutes
});

if (cluster.isPrimary) {
  const n = availableParallelism();
  for (let i = 0; i < n; i++) cluster.fork();
  await cache.set('user:42', { name: 'Ada' });
} else {
  console.log(await cache.get('user:42')); // visible to every worker
}
```

Call `createCache()` in **both** the primary and workers (typically at module top level). The primary owns the store and message handlers; workers only talk over IPC.

If the primary never creates the cache, worker operations reject after a short timeout (~2s) with an error that points at this requirement.

See [`examples/basic-cluster.mjs`](./examples/basic-cluster.mjs) for a runnable demo.

## Default storage options

When you do not pass `storage`, c-cache uses `MapStorage` with optional bounds.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `max` | `number` | *none* (unbounded) | Max entries; least-recently-used is evicted when full |
| `ttl` | `number` | *none* (no expiry) | TTL in milliseconds; expired entries are removed lazily on `get` / `has` |
| `updateAgeOnGet` | `boolean` | `false` | Refresh TTL on successful `get` |
| `allowStale` | `boolean` | `false` | Return an expired value once on `get`, then delete it |

`max` and `ttl` are opt-in: omit them for an unbounded Map with no expiration. `updateAgeOnGet` and `allowStale` only matter when `ttl` is set.

```ts
const cache = createCache({
  max: 1000,
  ttl: 60_000,
  updateAgeOnGet: true,
});
```

Do not combine these fields with a custom `storage` — that throws.

## Custom storage

Pass any object that implements `CacheStorage`:

```ts
import { createCache, MapStorage } from '@ben-bradley/c-cache';

const cache = createCache({
  storage: new MapStorage({ max: 500, ttl: 30_000 }),
});
```

### Writing your own storage

```ts
import type { CacheStorage } from '@ben-bradley/c-cache';
import { createCache } from '@ben-bradley/c-cache';

class MyStorage<K = string, V = unknown> implements CacheStorage<K, V> {
  #data = new Map<K, V>();

  get(key: K): V | undefined {
    return this.#data.get(key);
  }

  set(key: K, value: V): void {
    this.#data.set(key, value);
  }

  delete(key: K): boolean {
    return this.#data.delete(key);
  }

  has(key: K): boolean {
    return this.#data.has(key);
  }

  clear(): void {
    this.#data.clear();
  }
}

const cache = createCache({ storage: new MyStorage() });
```

**Contract** (`CacheStorage<K, V>`):

| Method | Returns | Notes |
|--------|---------|--------|
| `get(key)` | `V \| undefined` (or Promise) | Missing key → `undefined` |
| `set(key, value)` | `void` (or Promise) | Overwrites existing |
| `delete(key)` | `boolean` (or Promise) | `true` if the key existed |
| `has(key)` | `boolean` (or Promise) | |
| `clear()` | `void` (or Promise) | Removes all entries |

Optional backends such as LRU are intended as **separate packages** (e.g. `c-cache-lru`) so the core stays dependency-free.

**IPC constraint:** values must be structured-cloneable (same rules as `worker.send()`).

## API

```ts
const cache = createCache<K, V>(options?: CacheOptions<K, V>);

await cache.get(key);      // V | undefined
await cache.set(key, value);
await cache.delete(key);   // boolean
await cache.has(key);      // boolean
await cache.clear();
```

## Layout

```
src/
  storage/               # Data stores (CacheStorage implementations)
    types.ts
    map-storage.ts       # Default Map + max/ttl
  transport/             # Cluster IPC layer
    protocol.ts          # Message types
    state.ts             # Process-wide state
    handlers.ts          # Primary/worker listeners
    cluster-transport.ts # Public transport class
    index.ts
  cache.ts
  index.ts
examples/
  basic-cluster.mjs
```

## Status

**v0.3.1**

- TypeScript-first, ESM
- Always cluster-aware
- Default `MapStorage` with `max`, `ttl`, `updateAgeOnGet`, `allowStale`
- Pluggable `CacheStorage`
- Zero-config IPC
- Constructor validation
- Examples + Jest tests

## Development

```bash
npm install
npm run build
npm test
node examples/basic-cluster.mjs
```

### Watch mode

```bash
npm run dev    # tsc --watch + eslint on every src/**/*.ts change
npm run watch  # tsc --watch only
```

`npm run dev` rebuilds `dist/` and re-runs the linter whenever TypeScript sources change. No IDE-specific config required.

## A Note About AI

Save for this note and one small tweak in `package.json`, everything in v0.3.1 was generated by an AI agent.

## License

MIT
