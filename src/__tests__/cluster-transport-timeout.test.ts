/**
 * Worker-path / timeout tests.
 *
 * ClusterTransport only uses IPC when cluster.isWorker === true.
 * We mock node:cluster and process.send so we can exercise the timeout
 * without forking real processes.
 */
import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';

const clusterMock = {
  isWorker: true,
  isPrimary: false,
  workers: {} as Record<string, unknown>,
  on: jest.fn(),
};

jest.unstable_mockModule('node:cluster', () => ({
  default: clusterMock,
  __esModule: true,
}));

const { ClusterTransport, resetClusterTransportForTests } = await import(
  '../transport/index.js'
);

describe('ClusterTransport worker IPC timeout', () => {
  const originalSend = process.send;

  beforeEach(() => {
    resetClusterTransportForTests();
    clusterMock.isWorker = true;
    clusterMock.isPrimary = false;
    // Simulate a worker that can send, but nobody replies
    process.send = jest.fn(() => true) as typeof process.send;
  });

  afterEach(() => {
    process.send = originalSend;
    jest.useRealTimers();
    resetClusterTransportForTests();
  });

  test('rejects when primary does not reply before requestTimeoutMs', async () => {
    jest.useFakeTimers();

    const transport = new ClusterTransport<string, string>({
      requestTimeoutMs: 50,
    });

    const pending = transport.get('any-key');
    const expectation = expect(pending).rejects.toThrow(
      /no response from primary within 50ms/,
    );

    await jest.advanceTimersByTimeAsync(50);
    await expectation;
  });

  test('error message mentions createCache on the primary', async () => {
    jest.useFakeTimers();

    const transport = new ClusterTransport({ requestTimeoutMs: 10 });
    const pending = transport.set('k', 'v');
    const expectation = expect(pending).rejects.toThrow(/createCache\(\) in the primary/);

    await jest.advanceTimersByTimeAsync(10);
    await expectation;
  });

  test('has times out', async () => {
    jest.useFakeTimers();
    const transport = new ClusterTransport({ requestTimeoutMs: 20 });
    const pending = transport.has('k');
    const expectation = expect(pending).rejects.toThrow(/no response from primary/);
    await jest.advanceTimersByTimeAsync(20);
    await expectation;
  });

  test('delete times out', async () => {
    jest.useFakeTimers();
    const transport = new ClusterTransport({ requestTimeoutMs: 20 });
    const pending = transport.delete('k');
    const expectation = expect(pending).rejects.toThrow(/no response from primary/);
    await jest.advanceTimersByTimeAsync(20);
    await expectation;
  });

  test('clear times out', async () => {
    jest.useFakeTimers();
    const transport = new ClusterTransport({ requestTimeoutMs: 20 });
    const pending = transport.clear();
    const expectation = expect(pending).rejects.toThrow(/no response from primary/);
    await jest.advanceTimersByTimeAsync(20);
    await expectation;
  });

  test('rejects when process.send is unavailable', async () => {
    process.send = undefined;

    const transport = new ClusterTransport({ requestTimeoutMs: 1000 });
    await expect(transport.get('k')).rejects.toThrow(/process\.send\(\) failed/);
  });

  test('rejects when process.send returns false', async () => {
    process.send = jest.fn(() => false) as typeof process.send;

    const transport = new ClusterTransport({ requestTimeoutMs: 1000 });
    await expect(transport.delete('k')).rejects.toThrow(/process\.send\(\) failed/);
  });

  test('rejects non-positive requestTimeoutMs', () => {
    expect(() => new ClusterTransport({ requestTimeoutMs: 0 })).toThrow(
      /requestTimeoutMs must be a positive number/,
    );
    expect(() => new ClusterTransport({ requestTimeoutMs: -1 })).toThrow(
      /requestTimeoutMs must be a positive number/,
    );
  });
});

describe('ClusterTransport worker IPC reply', () => {
  const originalSend = process.send;
  let messageHandler: ((msg: unknown) => void) | undefined;

  beforeEach(() => {
    resetClusterTransportForTests();
    clusterMock.isWorker = true;
    clusterMock.isPrimary = false;
    messageHandler = undefined;

    const originalOn = process.on.bind(process);
    jest.spyOn(process, 'on').mockImplementation((event, handler) => {
      if (event === 'message') {
        messageHandler = handler as (msg: unknown) => void;
      }
      return originalOn(event as 'message', handler as () => void);
    });

    process.send = jest.fn((msg: unknown) => {
      const m = msg as { type: string; id: string; op: string };
      if (m.type === 'c-cache' && messageHandler) {
        queueMicrotask(() => {
          let result: unknown;
          if (m.op === 'get') result = 'from-primary';
          else if (m.op === 'has') result = true;
          else if (m.op === 'delete') result = true;
          messageHandler?.({ type: 'c-cache-reply', id: m.id, result });
        });
      }
      return true;
    }) as typeof process.send;
  });

  afterEach(() => {
    process.send = originalSend;
    jest.restoreAllMocks();
    resetClusterTransportForTests();
  });

  test('resolves get when primary replies', async () => {
    const transport = new ClusterTransport<string, string>({ requestTimeoutMs: 1000 });
    await expect(transport.get('k')).resolves.toBe('from-primary');
  });

  test('resolves has when primary replies', async () => {
    const transport = new ClusterTransport({ requestTimeoutMs: 1000 });
    await expect(transport.has('k')).resolves.toBe(true);
  });

  test('resolves set when primary replies', async () => {
    const transport = new ClusterTransport({ requestTimeoutMs: 1000 });
    await expect(transport.set('k', 'v')).resolves.toBeUndefined();
  });
});
