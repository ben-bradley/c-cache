import { describe, test, expect, beforeEach } from '@jest/globals';
import {
  ClusterTransport,
  resetClusterTransportForTests,
} from '../transport/index.js';
import { MapStorage } from '../storage/map-storage.js';
import type { CacheStorage } from '../storage/types.js';

describe('ClusterTransport (single-process / primary path)', () => {
  let transport: ClusterTransport<string, number>;

  beforeEach(async () => {
    resetClusterTransportForTests();
    transport = new ClusterTransport<string, number>();
  });

  test('set and get a value', async () => {
    await transport.set('a', 1);
    expect(await transport.get('a')).toBe(1);
  });

  test('get missing key returns undefined', async () => {
    expect(await transport.get('missing')).toBeUndefined();
  });

  test('has works', async () => {
    await transport.set('b', 2);
    expect(await transport.has('b')).toBe(true);
    expect(await transport.has('missing')).toBe(false);
  });

  test('delete works', async () => {
    await transport.set('c', 3);
    expect(await transport.delete('c')).toBe(true);
    expect(await transport.has('c')).toBe(false);
    expect(await transport.delete('missing')).toBe(false);
  });

  test('clear removes all keys', async () => {
    await transport.set('x', 10);
    await transport.set('y', 20);
    await transport.clear();
    expect(await transport.has('x')).toBe(false);
    expect(await transport.has('y')).toBe(false);
  });

  test('overwrites existing value', async () => {
    await transport.set('k', 1);
    await transport.set('k', 99);
    expect(await transport.get('k')).toBe(99);
  });
});

describe('ClusterTransport with custom storage', () => {
  beforeEach(() => {
    resetClusterTransportForTests();
  });

  test('delegates to the provided storage', async () => {
    const dataStore = new MapStorage<string, string>();
    const transport = new ClusterTransport({ storage: dataStore });

    await transport.set('custom:hello', 'world');
    expect(await transport.get('custom:hello')).toBe('world');
  });

  test('accepts a minimal mock storage', async () => {
    const store = new Map<string, unknown>();
    const mock: CacheStorage<string, unknown> = {
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

    const transport = new ClusterTransport({ storage: mock });
    expect(transport).toBeInstanceOf(ClusterTransport);
    await transport.set('mock:k', 'v');
    expect(await transport.get('mock:k')).toBe('v');
  });
});
