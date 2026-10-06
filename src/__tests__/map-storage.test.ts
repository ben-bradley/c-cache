import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { MapStorage } from '../storage/map-storage.js';

describe('MapStorage', () => {
  let storage: MapStorage<string, number>;

  beforeEach(() => {
    storage = new MapStorage<string, number>();
  });

  test('set and get a value', () => {
    storage.set('a', 1);
    expect(storage.get('a')).toBe(1);
  });

  test('get missing key returns undefined', () => {
    expect(storage.get('missing')).toBeUndefined();
  });

  test('has returns true for existing key', () => {
    storage.set('b', 2);
    expect(storage.has('b')).toBe(true);
  });

  test('has returns false for missing key', () => {
    expect(storage.has('missing')).toBe(false);
  });

  test('delete removes key and returns true', () => {
    storage.set('c', 3);
    expect(storage.delete('c')).toBe(true);
    expect(storage.has('c')).toBe(false);
    expect(storage.get('c')).toBeUndefined();
  });

  test('delete missing key returns false', () => {
    expect(storage.delete('missing')).toBe(false);
  });

  test('clear removes all keys', () => {
    storage.set('x', 10);
    storage.set('y', 20);
    storage.clear();
    expect(storage.has('x')).toBe(false);
    expect(storage.has('y')).toBe(false);
  });

  test('overwrites existing value', () => {
    storage.set('k', 1);
    storage.set('k', 99);
    expect(storage.get('k')).toBe(99);
  });
});

describe('MapStorage max', () => {
  test('evicts least-recently-used when over max', () => {
    const storage = new MapStorage<string, number>({ max: 2 });
    storage.set('a', 1);
    storage.set('b', 2);
    storage.set('c', 3); // should evict 'a'
    expect(storage.has('a')).toBe(false);
    expect(storage.get('b')).toBe(2);
    expect(storage.get('c')).toBe(3);
  });

  test('get refreshes recency so a recent key is not evicted', () => {
    const storage = new MapStorage<string, number>({ max: 2 });
    storage.set('a', 1);
    storage.set('b', 2);
    storage.get('a'); // a becomes most-recent
    storage.set('c', 3); // should evict b, not a
    expect(storage.has('b')).toBe(false);
    expect(storage.get('a')).toBe(1);
    expect(storage.get('c')).toBe(3);
  });

  test('rejects non-positive max', () => {
    expect(() => new MapStorage({ max: 0 })).toThrow(/positive/);
    expect(() => new MapStorage({ max: -1 })).toThrow(/positive/);
  });
});

describe('MapStorage ttl', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('expired entry is treated as miss', () => {
    const storage = new MapStorage<string, string>({ ttl: 1000 });
    storage.set('k', 'v');
    expect(storage.get('k')).toBe('v');

    jest.advanceTimersByTime(1001);
    expect(storage.get('k')).toBeUndefined();
    expect(storage.has('k')).toBe(false);
  });

  test('updateAgeOnGet extends life', () => {
    const storage = new MapStorage<string, string>({
      ttl: 1000,
      updateAgeOnGet: true,
    });
    storage.set('k', 'v');

    jest.advanceTimersByTime(800);
    expect(storage.get('k')).toBe('v'); // refreshes TTL

    jest.advanceTimersByTime(800); // would have expired without refresh
    expect(storage.get('k')).toBe('v');
  });

  test('allowStale returns value once then removes', () => {
    const storage = new MapStorage<string, string>({
      ttl: 1000,
      allowStale: true,
    });
    storage.set('k', 'v');

    jest.advanceTimersByTime(1001);
    expect(storage.get('k')).toBe('v'); // stale hit
    expect(storage.get('k')).toBeUndefined(); // gone
  });

  test('rejects non-positive ttl', () => {
    expect(() => new MapStorage({ ttl: 0 })).toThrow(/positive/);
    expect(() => new MapStorage({ ttl: -5 })).toThrow(/positive/);
  });
});
