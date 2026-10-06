import { describe, test, expect, beforeEach } from '@jest/globals';
import { createCache, Cache } from '../cache.js';
import { MapStorage } from '../storage/map-storage.js';
import { resetClusterTransportForTests } from '../transport/index.js';
import type { CacheStorage } from '../storage/types.js';

describe('Cache', () => {
  beforeEach(() => {
    resetClusterTransportForTests();
  });

  test('createCache returns a Cache instance', () => {
    const cache = createCache();
    expect(cache).toBeInstanceOf(Cache);
  });

  test('default storage works (set/get)', async () => {
    const cache = createCache<string, string>();
    await cache.set('hello', 'world');
    expect(await cache.get('hello')).toBe('world');
    expect(await cache.has('hello')).toBe(true);
  });

  test('get missing key returns undefined', async () => {
    const cache = createCache();
    expect(await cache.get('nope')).toBeUndefined();
  });

  test('delete works', async () => {
    const cache = createCache<string, number>();
    await cache.set('n', 42);
    expect(await cache.delete('n')).toBe(true);
    expect(await cache.has('n')).toBe(false);
  });

  test('clear empties the cache', async () => {
    const cache = createCache<string, string>();
    await cache.set('a', '1');
    await cache.set('b', '2');
    await cache.clear();
    expect(await cache.has('a')).toBe(false);
    expect(await cache.has('b')).toBe(false);
  });

  test('accepts a custom storage', async () => {
    const dataStore = new MapStorage<string, { id: number }>();
    const cache = createCache({ storage: dataStore });

    await cache.set('user', { id: 7 });
    expect(await cache.get('user')).toEqual({ id: 7 });
  });

  test('works with a minimal mock storage', async () => {
    const store = new Map<string, unknown>();
    const mockStorage: CacheStorage<string, unknown> = {
      get: (k) => store.get(k),
      set: (k, v) => {
        store.set(k, v);
      },
      delete: (k) => store.delete(k),
      has: (k) => store.has(k),
      clear: () => {
        store.clear();
      },
    };

    const cache = createCache({ storage: mockStorage });
    await cache.set('k', 'v');
    expect(await cache.get('k')).toBeDefined();
  });

  test('throws when storage is missing required methods', () => {
    expect(() => createCache({ storage: {} as CacheStorage })).toThrow(
      /missing required method/,
    );
  });

  test('throws when storage is not an object', () => {
    expect(() => createCache({ storage: null as unknown as CacheStorage })).toThrow(
      /must be an object/,
    );
  });

  test('forwards max/ttl to default MapStorage', async () => {
    const cache = createCache<string, number>({ max: 2 });
    await cache.set('a', 1);
    await cache.set('b', 2);
    await cache.set('c', 3);
    expect(await cache.has('a')).toBe(false);
    expect(await cache.get('b')).toBe(2);
    expect(await cache.get('c')).toBe(3);
  });

  test('throws when both storage and map options are provided', () => {
    expect(() =>
      createCache({
        storage: new MapStorage(),
        max: 10,
      }),
    ).toThrow(/either options.storage or MapStorage options/);
  });
});
